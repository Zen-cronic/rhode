from dataclasses import dataclass, field
from hashlib import sha256
import bisect
import json
import math


@dataclass
class Replay:
    """One-second deterministic road model; telemetry speed is the preceding second's mean.

    Duty is the state effective at the observation timestamp. GPS and stop timestamps
    remain modeled samples, not proof of physical dock activity.
    """
    coordinates: list[list[float]]
    start_time_ms: int
    seed: int = 42
    speed_kph: float = 70
    dock_wait_seconds: int = 0
    disruption_seconds: int = 0
    elapsed_seconds: int = 0
    paused: bool = True
    route_evidence: str = 'unverified'
    stop_indices: list[int] | None = None
    stop_wait_seconds: list[int] | None = None
    disruption_start_seconds: int = 60
    _lengths: list[float] = field(init=False, repr=False)
    _distance: float = field(init=False, default=0, repr=False)
    _next_stop: int = field(init=False, default=1, repr=False)
    _wait: int = field(init=False, default=0, repr=False)
    _last_speed: float = field(init=False, default=0, repr=False)
    _initial_emitted: bool = field(init=False, default=False, repr=False)

    def __post_init__(self):
        if len(self.coordinates) < 2 or not math.isfinite(self.speed_kph) or not 0 < self.speed_kph <= 120 or self.route_evidence not in ('valhalla-truck', 'synthetic-test-route'):
            raise ValueError('Verified truck-route geometry or explicitly labeled test route required')
        if any(len(p) != 2 or not all(math.isfinite(v) for v in p) or not -180 <= p[0] <= 180 or not -90 <= p[1] <= 90 for p in self.coordinates):
            raise ValueError('Finite longitude/latitude geometry required')
        if any(not isinstance(v, int) or v < 0 for v in [self.dock_wait_seconds, self.disruption_seconds, self.disruption_start_seconds]):
            raise ValueError('Nonnegative integer event durations required')
        self.stop_indices = list(self.stop_indices) if self.stop_indices is not None else [0, len(self.coordinates)-1]
        if not self.stop_indices or any(not isinstance(i, int) or i < 0 or i >= len(self.coordinates) for i in self.stop_indices) or self.stop_indices != sorted(set(self.stop_indices)) or self.stop_indices[0] != 0 or self.stop_indices[-1] != len(self.coordinates)-1:
            raise ValueError('Ordered unique stop indices must include route start and end')
        self.stop_wait_seconds = list(self.stop_wait_seconds) if self.stop_wait_seconds is not None else [self.dock_wait_seconds]+[0]*(len(self.stop_indices)-1)
        if len(self.stop_wait_seconds) != len(self.stop_indices) or any(not isinstance(v, int) or v < 0 for v in self.stop_wait_seconds):
            raise ValueError('One nonnegative dwell duration per stop required')
        self._lengths = [0.0]
        for a, b in zip(self.coordinates, self.coordinates[1:]):
            lat1, lat2 = math.radians(a[1]), math.radians(b[1])
            h = math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
            self._lengths.append(self._lengths[-1]+6371*2*math.asin(min(1, math.sqrt(h))))
        if self._lengths[-1] <= 0:
            raise ValueError('Route must contain positive road distance')
        self.reset()

    def reset(self):
        self.elapsed_seconds = 0
        self.paused = True
        self._distance = 0.0
        self._next_stop = 1
        self._wait = self.stop_wait_seconds[0]
        self._last_speed = 0.0
        self._initial_emitted = False

    def _held(self):
        return self.disruption_start_seconds <= self.elapsed_seconds < self.disruption_start_seconds+self.disruption_seconds

    def phase(self):
        if self._wait > 0:
            return 'dock_wait'
        if self._next_stop >= len(self.stop_indices):
            return 'route_complete'
        return 'road_hold' if self._held() else 'driving'

    def _speed(self):
        # The seed changes actual motion; no process-global RNG or tick-size dependence.
        bucket = self.elapsed_seconds // 60
        value = int(sha256(f'{self.seed}:{bucket}'.encode()).hexdigest()[:8], 16)
        return self.speed_kph*(0.75+(value % 26)/100)

    def sample(self):
        index = bisect.bisect_left(self._lengths, self._distance)
        if index == 0:
            position = self.coordinates[0]
        else:
            a, b = self.coordinates[index-1:index+1]
            segment = self._lengths[index]-self._lengths[index-1]
            fraction = 0 if segment == 0 else (self._distance-self._lengths[index-1])/segment
            position = [a[0]+fraction*(b[0]-a[0]), a[1]+fraction*(b[1]-a[1])]
        return {'at_ms': self.start_time_ms+self.elapsed_seconds*1000, 'position': {'lng': position[0], 'lat': position[1]}, 'speedKph': self._last_speed, 'odometerKm': self._distance, 'duty': 'driving' if self.phase() == 'driving' else 'on_duty', 'provenance': 'synthetic', 'accuracyM': 5}

    def advance_samples(self, seconds: int):
        if not isinstance(seconds, int) or seconds < 0:
            raise ValueError('Use nonnegative integer seconds; reset to rewind')
        if self.paused:
            return []
        events = []
        if not self._initial_emitted:
            events.append(self.sample())
            self._initial_emitted = True
        for _ in range(seconds):
            before = self._distance
            if self._wait > 0:
                self._wait -= 1
            elif self._next_stop < len(self.stop_indices) and not self._held():
                target = self._lengths[self.stop_indices[self._next_stop]]
                self._distance = min(target, self._distance+self._speed()/3600)
                if self._distance >= target:
                    self._wait = self.stop_wait_seconds[self._next_stop]
                    self._next_stop += 1
            self.elapsed_seconds += 1
            self._last_speed = (self._distance-before)*3600
            events.append(self.sample())
        return events

    def advance(self, seconds: int):
        self.advance_samples(seconds)
        return self.sample()

    def initial_conditions(self):
        return {'model_version': 'road-events-v2', 'coordinates': self.coordinates, 'start_time_ms': self.start_time_ms, 'seed': self.seed, 'speed_kph': self.speed_kph, 'dock_wait_seconds': self.dock_wait_seconds, 'disruption_seconds': self.disruption_seconds, 'disruption_start_seconds': self.disruption_start_seconds, 'stop_indices': self.stop_indices, 'stop_wait_seconds': self.stop_wait_seconds, 'route_evidence': self.route_evidence}

    def conditions_hash(self):
        return sha256(json.dumps(self.initial_conditions(), sort_keys=True).encode()).hexdigest()
