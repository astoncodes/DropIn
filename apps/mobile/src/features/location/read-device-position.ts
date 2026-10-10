import * as Location from 'expo-location';
import { UserFacingError } from '@dropin/shared';

/** Expo's web adapter defaults to an infinitely cached reading. Presence and
 * photo proximity checks need a new reading, with a bounded wait on all devices. */
export async function readDevicePosition(accuracy = Location.Accuracy.High) {
  const options = { accuracy, maximumAge: 0, timeout: 20_000 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync(options),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new UserFacingError(
                'Location is taking too long. Move somewhere with a clear signal and try again.',
              ),
            ),
          20_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
