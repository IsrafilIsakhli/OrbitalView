import type {
  EarthEngine,
  EarthEngineOptions,
} from "../contracts/earth-engine";
import { CesiumEarthEngine } from "./CesiumEarthEngine";

export function createEarthEngine(
  container: HTMLElement,
  options: EarthEngineOptions,
): EarthEngine {
  return new CesiumEarthEngine(container, options);
}
