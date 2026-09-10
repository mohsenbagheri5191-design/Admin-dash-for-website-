# images

Put `logo.png` here — PNG with a transparent background, 72×72 or 108×108 for
retina. It displays at 36×36.

Then, in **every** HTML file, in **both** the nav and the footer, swap the
lettermark for the image. See the root `README.md` for the exact markup, and
note that the gated pages use absolute paths while `pages/*.html` needs
`../images/logo.png`.

Until you do, the nav shows the gradient "N" lettermark (`.logo-fallback`),
which is the site's designed default rather than a placeholder.
