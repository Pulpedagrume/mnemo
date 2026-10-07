import type { AppSettings, Clock, IdGenerator, Rng, StudyCalendar } from '@mnemo/core';
import { createIdGenerator, isValidTimeZone, settingsFromRows, studyCalendar } from '@mnemo/core';
import type { Repository, Stores } from '@mnemo/storage';

/** Everything services need, injected once by the application entry point. */
export interface ServiceContext {
  repo: Repository;
  clock: Clock;
  rng: Rng;
  newId: IdGenerator;
  /** IANA zone of the device, used when the user has not chosen one. */
  deviceTimeZone: string;
}

export function createServiceContext(opts: {
  repo: Repository;
  clock: Clock;
  rng: Rng;
  deviceTimeZone: string;
}): ServiceContext {
  return { ...opts, newId: createIdGenerator(opts.clock, opts.rng) };
}

export async function loadSettings(stores: Stores): Promise<AppSettings> {
  return settingsFromRows(await stores.settings.all());
}

/** Effective time zone: the user's choice when valid, else the device's, else UTC. */
export function effectiveTimeZone(settings: AppSettings, deviceTimeZone: string): string {
  if (settings.timeZone && isValidTimeZone(settings.timeZone)) return settings.timeZone;
  return isValidTimeZone(deviceTimeZone) ? deviceTimeZone : 'UTC';
}

export async function loadCalendar(ctx: ServiceContext, stores?: Stores): Promise<StudyCalendar> {
  const settings = await loadSettings(stores ?? ctx.repo);
  return studyCalendar(effectiveTimeZone(settings, ctx.deviceTimeZone), settings.rolloverHour);
}
