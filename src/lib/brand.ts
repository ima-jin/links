/**
 * Human-facing product display name.
 *
 * The published `@ima-jin/config@0.8.0` (the latest on npmjs.org as of this
 * port) predates the monorepo's own `APP_DISPLAY_NAME` export — a
 * version-skew gap, not a kernel-internal dependency. This app's own copy
 * only needs the plain display string, so it is duplicated here rather than
 * blocked on a republish; drop it in favor of the shared export once a
 * newer `@ima-jin/config` publishes it.
 */
export const APP_DISPLAY_NAME = 'Imajin';
