import { Cartesian3 } from "cesium";
import { describe, expect, it, vi } from "vitest";
import { CesiumSatelliteLayer, initialSatelliteLayerSnapshot } from "./CesiumSatelliteLayer";

describe("Follow and rendered worker frame synchronization",()=>{
  it("uses the displayed target immediately, not a lagging camera-only interpolation",()=>{
    const layer=new CesiumSatelliteLayer();
    const update=vi.fn();
    const target=Cartesian3.fromDegrees(30,40,420_000);
    Object.assign(layer,{
      snapshot:{...initialSatelliteLayerSnapshot,followSelected:true},
      followTarget:target,
      followFrame:{update},
      context:{scene:{camera:{positionCartographic:{height:500_000}},globe:{getHeight:()=>0}}},
    });
    layer.tick();
    expect(update.mock.calls[0]?.[1]).toBe(target);
    const nextTarget=Cartesian3.fromDegrees(30.06,40.03,420_010);
    Object.assign(layer,{followTarget:nextTarget});layer.tick();
    expect(update.mock.calls[1]?.[1]).toBe(nextTarget);
    expect(update.mock.calls[1]?.[2]).toBe(900);
    Object.assign(layer,{snapshot:{...initialSatelliteLayerSnapshot,followSelected:false}});
    layer.tick();expect(update).toHaveBeenCalledTimes(2);
  });
});
