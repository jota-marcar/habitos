// The version of the app that is running (RF-54, ADR-0024). It comes from app.json when the
// JavaScript is bundled, so that each over-the-air update carries its own: the version of the
// binary, which TestFlight shows, only changes with a build.

import appJson from "../../app.json";

export const APP_VERSION: string = appJson.expo.version;
