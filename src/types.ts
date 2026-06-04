/**
 * Response shapes for the WP GTFS Pro REST API (`/wp-json/wp-gtfs-pro/v1/*`).
 *
 * These mirror the actual JSON returned by a live GTFS Pro site (verified against
 * a production install), not the idealized shapes in the spec — where they differ,
 * reality wins. Notably: `/stops/search` and `/stops/nearby` wrap results in a
 * `stops` array, and RT vehicles use `id`/`next_eta`/`next_stop` (not the
 * `vehicle_id`/`speed` the spec sketches).
 */

export interface Feed {
  id: string;
  name: string;
  url: string;
  active: boolean;
  logo?: number;
  rt_vehicles?: string;
  rt_trips?: string;
  rt_alerts?: string;
}

/** One route serving a stop, with its next scheduled departure times. */
export interface RouteAtStop {
  route_id: string;
  name: string;
  color: string;
  url?: string;
  next: string[];
}

export interface NearbyStop {
  id: string;
  name: string;
  code: string;
  lat: number;
  lon: number;
  distance_m: number;
  distance_text: string;
  is_timepoint: boolean;
  routes: RouteAtStop[];
}

export interface NearbyStopsResponse {
  stops: NearbyStop[];
}

export interface SearchStop {
  id: string;
  name: string;
  code: string;
  lat: number;
  lon: number;
  label: string;
  type: string;
}

export interface SearchStopsResponse {
  stops: SearchStop[];
}

export interface Departure {
  route_id: string;
  name: string;
  color: string;
  url?: string;
  headsign: string;
  time: string;
  minutes: number;
}

export interface DeparturesResponse {
  stop: { id: string; name: string; code: string };
  departures: Departure[];
  ts: number;
}

export interface MapStop {
  id: string;
  name: string;
  code: string;
  lat: number;
  lon: number;
}

/** A shape point is a [latitude, longitude] pair. */
export type ShapePoint = [number, number];

export interface RouteMapResponse {
  shapes: ShapePoint[];
  stops: MapStop[];
}

export interface SystemRoute {
  route_id: string;
  name: string;
  long_name: string;
  color: string;
  shapes: ShapePoint[];
  stops: MapStop[];
}

export interface SystemMapResponse {
  routes: SystemRoute[];
}

export interface AlertActivePeriod {
  start: number | null;
  end: number | null;
}

export interface Alert {
  id: string;
  header: string;
  description: string;
  url: string;
  /** GTFS-RT Cause enum (integer). Translate before showing to a human. */
  cause: number | null;
  /** GTFS-RT Effect enum (integer). */
  effect: number | null;
  /** GTFS-RT SeverityLevel enum (integer). */
  severity: number | null;
  routes: string[];
  stops: string[];
  active_period: AlertActivePeriod[];
}

export interface AlertsResponse {
  alerts: Alert[];
  ts?: number;
}

export interface Vehicle {
  id: string;
  lat: number;
  lon: number;
  bearing: number | null;
  route_id: string;
  trip_id: string;
  direction_id: number | null;
  stop_id: string | null;
  status: number | null;
  timestamp: number | null;
  route_name: string;
  color: string;
  direction: string | null;
  next_stop: string | null;
  next_eta: number | null;
}

export interface VehiclesResponse {
  vehicles: Vehicle[];
  ts?: number;
}

export interface GeocodeResponse {
  lat: number;
  lon: number;
  label: string;
}
