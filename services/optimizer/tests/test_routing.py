import pytest
from roadstar_optimizer.routing import decode_polyline6

def test_polyline6_decodes_coordinate_order_and_precision():
    assert decode_polyline6('_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI') == [[-120.2,38.5],[-120.95,40.7],[-126.453,43.252]]

def test_incomplete_geometry_is_rejected():
    with pytest.raises(ValueError):decode_polyline6('_izlhA')
