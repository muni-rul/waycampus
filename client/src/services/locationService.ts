export interface GPSPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface LocalCampusPosition {
  x: number;
  y: number;
  z: number;
  distanceFromCampusCenter: number;
  isInsideCampus: boolean;
  accuracyMeters: number;
  nearestNodeId?: string;
  nearestNodeLabel?: string;
}

export class LocationService {
  // Christ College (Autonomous) Irinjalakuda GPS Reference Anchor (Main Block Portico Center)
  private static readonly CAMPUS_LAT = 10.354794;
  private static readonly CAMPUS_LNG = 76.212791;
  private static readonly METERS_PER_LAT = 110574;
  private static readonly METERS_PER_LNG = 111320 * Math.cos((10.354794 * Math.PI) / 180); // ~109508

  private static watchId: number | null = null;

  /**
   * Convert WGS84 (Lat, Lng) to Campus 3D local coordinates (X: East, Y: Up, Z: South)
   */
  public static gpsToLocal(lat: number, lng: number, accuracy: number = 10): LocalCampusPosition {
    const dx = (lng - this.CAMPUS_LNG) * this.METERS_PER_LNG;
    const dz = -(lat - this.CAMPUS_LAT) * this.METERS_PER_LAT;

    const x = Math.round(dx * 10) / 10;
    const z = Math.round(dz * 10) / 10;
    const y = 0;

    const distanceFromCampusCenter = Math.round(Math.sqrt(x * x + z * z));
    const isInsideCampus = distanceFromCampusCenter <= 450;

    return {
      x,
      y,
      z,
      distanceFromCampusCenter,
      isInsideCampus,
      accuracyMeters: Math.round(accuracy),
    };
  }

  /**
   * Get single real-time GPS position from browser Geolocation API
   */
  public static getCurrentGPSPosition(): Promise<GPSPosition> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation is not supported by this device or browser.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }

  /**
   * Watch live GPS position changes
   */
  public static startWatchingGPS(
    onSuccess: (pos: GPSPosition, local: LocalCampusPosition) => void,
    onError: (err: GeolocationPositionError) => void
  ): number | null {
    if (!('geolocation' in navigator)) {
      return null;
    }

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const gps: GPSPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        };
        const local = this.gpsToLocal(gps.latitude, gps.longitude, gps.accuracy);
        onSuccess(gps, local);
      },
      (error) => {
        onError(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 1000,
      }
    );

    return this.watchId;
  }

  public static stopWatchingGPS(): void {
    if (this.watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Listen to device compass / gyroscope heading
   */
  public static listenCompassHeading(onHeading: (degrees: number) => void): () => void {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let heading = (e as any).webkitCompassHeading;
      if (typeof heading === 'number') {
        onHeading(Math.round(heading));
      } else if (e.alpha !== null) {
        onHeading(Math.round(360 - e.alpha));
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }
}
