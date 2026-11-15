// The public site (home, feature pages, help center) lives in its own project, RELAY-Landing-page.
// Anything in the app that points at it goes through here.
export const LANDING_URL = ((import.meta.env.VITE_LANDING_URL as string | undefined) ?? 'https://relay-landing-page-five.vercel.app').replace(/\/+$/, '');
export const landingUrl = (path = '/') => LANDING_URL + path;
