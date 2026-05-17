export const dynamic = "force-static";
// Twitter card image for the homepage. Same dimensions + content as
// the OG image (summary_large_image = 1200x630), so re-export the
// same renderer rather than duplicate the JSX.

export { default, size, contentType, alt } from "./opengraph-image";
