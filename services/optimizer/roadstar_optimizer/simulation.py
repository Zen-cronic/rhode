from dataclasses import dataclass, field
from hashlib import sha256
import json
import math

@dataclass
class Replay:
    # Route comes from Valhalla GeoJSON, never interpolated straight across cities.
    coordinates: list[list[float]]
    start_time_ms: int
    seed: int = 42
    speed_kph: float = 70
    dock_wait_seconds: int = 0
    disruption_seconds: int = 0
    elapsed_seconds: int = 0
    paused: bool = True
    route_evidence: str = 'unverified'
    _lengths: list[float] = field(init=False)

    def __post_init__(self):
        if len(self.coordinates)<2 or self.speed_kph<=0 or self.route_evidence not in ('valhalla-truck','synthetic-test-route'):
            raise ValueError('Verified truck-route geometry or explicitly labeled test route required')
        self._lengths=[0.0]
        for a,b in zip(self.coordinates,self.coordinates[1:]):
            lat1,lat2=math.radians(a[1]),math.radians(b[1])
            dlat=lat2-lat1;dlon=math.radians(b[0]-a[0])
            h=math.sin(dlat/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
            self._lengths.append(self._lengths[-1]+6371*2*math.asin(min(1,math.sqrt(h))))
    def reset(self):
        self.elapsed_seconds=0
        self.paused=True
    def advance(self,seconds:int):
        if seconds<0:
            raise ValueError('Time cannot move backward; use reset')
        if not self.paused:
            self.elapsed_seconds+=seconds
        wait=self.dock_wait_seconds+self.disruption_seconds
        distance=min(self._lengths[-1],max(0,self.elapsed_seconds-wait)*self.speed_kph/3600)
        index=next((i for i,length in enumerate(self._lengths) if length>=distance),len(self._lengths)-1)
        if index==0:
            position=self.coordinates[0]
        else:
            a,b=self.coordinates[index-1:index+1]
            segment=self._lengths[index]-self._lengths[index-1]
            f=0 if segment==0 else (distance-self._lengths[index-1])/segment
            position=[a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])]
        moving=self.elapsed_seconds>wait and distance<self._lengths[-1]
        return {'at_ms':self.start_time_ms+self.elapsed_seconds*1000,'position':{'lng':position[0],'lat':position[1]},'speedKph':self.speed_kph if moving else 0,'odometerKm':round(distance,4),'duty':'driving' if moving else 'on_duty','provenance':'synthetic','accuracyM':5}
    def conditions_hash(self):
        return sha256(json.dumps({'coordinates':self.coordinates,'start_time_ms':self.start_time_ms,'seed':self.seed,'speed_kph':self.speed_kph,'dock_wait_seconds':self.dock_wait_seconds,'disruption_seconds':self.disruption_seconds},sort_keys=True).encode()).hexdigest()
