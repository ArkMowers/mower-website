# Account redaction patch

- Generation method: built-in `image_gen` tool; no CLI/API fallback.
- Reference image: local `运行日志-dark.png`, inspected before generation.
- Project asset: `scripts/assets/account-redaction.png` (348 × 160 px, RGB PNG, no alpha).
- Current workspace path: `D:\Repository\mowerhome\scripts\assets\account-redaction.png`.
- The generated patch was resized and flattened to an opaque background before storage.

The preparation script overlays this patch only on the in-game nickname and user
ID. The original titlebar information remains unchanged. Other interface pixels
remain unchanged in the PNG review artifacts, apart from the existing repair of
the light capture's green-screen window corners. Public WebP files are compressed
derivatives. Source screenshots remain local and are excluded from publication;
previous public originals are archived under `.screenshots.local/original-public/`.

## Complete final prompt

```text
Use case: precise-object-edit. Asset type: small opaque account-redaction patch for the provided software screenshot. Input image is a reference for the neutral dark gray in-game account label in the game's bottom-left area; DO NOT output or recreate the full screenshot. Output ONLY one flat, rectangular, wide patch with aspect ratio approximately 87:40, fully filled edge to edge in opaque charcoal gray (#303532). Inside place exactly two short simple light gray horizontal bars in place of nickname and user ID: upper bar longer and slightly thicker, lower bar shorter and thinner. They must look like intentional anonymized UI lines. No readable writing, letters, digits, logos, symbols, icons, checkerboard, alpha, gradients, screenshot details, bevel, border, shadow or surrounding canvas. Every pixel must be fully opaque. This graphic will be resized and composited over the original nickname and ID; preserve the original screenshot elsewhere by NOT including it in your output.
```
