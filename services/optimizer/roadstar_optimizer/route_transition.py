"""Preserve a simulated truck's traveled path while replacing only remaining roads.

This is the deterministic motion prerequisite for operational adoption. The caller
must separately verify approval/receipt, pause emission, and retain the original
replay plus transition time for reset/replay and stable historical event IDs.
"""
import bisect
import math
from dataclasses import dataclass
from .simulation import Replay


def distance_km(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
    return 6371*2*math.asin(min(1, math.sqrt(h)))


@dataclass
class RouteTransition:
    replay: Replay
    at_seconds: int
    previous_conditions_hash: str
    conditions_hash: str
    retained_odometer_km: float
    retained_wait_seconds: int
    remaining_stop_wait_seconds: list[int]


def replace_remaining_route(previous: Replay, coordinates: list[list[float]], stop_indices: list[int]) -> RouteTransition:
    """Return a paused fork without changing the old replay or any observation.

    New leg endpoints must match the existing outstanding stops in order. No new
    service, dock dwell, rest credit, movement or elapsed time is invented. A start
    discrepancy above 10 cm is rejected, not bridged; sub-decimeter coordinate
    rounding is anchored to the exact prior sample. This is intentionally stricter
    than the operational route preview's GPS snap tolerance.
    """
    if not previous.paused:
        raise ValueError('Pause the replay before replacing remaining roads')
    if previous._next_stop >= len(previous.stop_indices):
        raise ValueError('No remaining stops; a completed route cannot be replaced')
    # Validate coordinates and ordered endpoints before indexing any supplied data.
    incoming = Replay(coordinates, previous.start_time_ms, stop_indices=stop_indices, route_evidence=previous.route_evidence)
    current = previous.sample()['position']
    origin = [current['lng'], current['lat']]
    if distance_km(origin, incoming.coordinates[0]) > .0001:
        raise ValueError('Alternate route does not begin at the current road position; no bridge or teleport is permitted')
    remaining = previous.stop_indices[previous._next_stop:]
    if len(incoming.stop_indices)-1 != len(remaining):
        raise ValueError('Alternate route must retain every outstanding stop')
    for new_index, old_index in zip(incoming.stop_indices[1:], remaining):
        if distance_km(incoming.coordinates[new_index], previous.coordinates[old_index]) > .02:
            raise ValueError('Alternate route changes outstanding stop order or location')
    # Keep every traversed vertex, ending with the exact interpolated observation.
    index = max(bisect.bisect_left(previous._lengths, previous._distance), previous.stop_indices[previous._next_stop-1])
    prefix = [list(p) for p in previous.coordinates[:index]]
    # Keep repeated zero-length road vertices when a completed stop refers to
    # their exact index; collapsing them would erase that stop's provenance.
    prefix.append(origin)
    offset = len(prefix)-1
    combined = prefix + [list(p) for p in incoming.coordinates[1:]]
    retained = previous.stop_indices[:previous._next_stop]
    if any(i > offset for i in retained):
        raise ValueError('Motion and completed-stop evidence disagree')
    stops = list(retained) + [offset+i for i in incoming.stop_indices[1:]]
    waits = list(previous.stop_wait_seconds)
    fork = Replay(combined, previous.start_time_ms, seed=previous.seed, speed_kph=previous.speed_kph,
                  dock_wait_seconds=previous.dock_wait_seconds, disruption_seconds=previous.disruption_seconds,
                  disruption_start_seconds=previous.disruption_start_seconds, stop_indices=stops,
                  slowdown_start_seconds=previous.slowdown_start_seconds, slowdown_seconds=previous.slowdown_seconds,
                  slowdown_factor=previous.slowdown_factor,
                  stop_wait_seconds=waits, route_evidence=previous.route_evidence)
    # Interpolating a spherical segment introduces tiny rounding differences. Keep
    # the measured traveled distance exactly and correct that one prefix length.
    if abs(fork._lengths[offset]-previous._distance) > .000001:
        raise ValueError('Traveled geometry does not preserve the odometer within one millimeter')
    correction = previous._distance-fork._lengths[offset]
    fork._lengths = [d if i < offset else d+correction for i, d in enumerate(fork._lengths)]
    fork.elapsed_seconds = previous.elapsed_seconds
    fork._distance = previous._distance
    fork._next_stop = previous._next_stop
    fork._wait = previous._wait
    fork._last_speed = previous._last_speed
    fork._initial_emitted = previous._initial_emitted
    fork.paused = True
    return RouteTransition(fork, previous.elapsed_seconds, previous.conditions_hash(), fork.conditions_hash(),
                           previous._distance, previous._wait, waits[previous._next_stop:])
