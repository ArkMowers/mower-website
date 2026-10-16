# Spine 3.8 WebGL runtime

This directory vendors the official, self-contained Spine TypeScript WebGL runtime.

- Repository: <https://github.com/EsotericSoftware/spine-runtimes>
- Branch: `3.8`
- Exact commit: `8b4844bd4b193ba9e54487ed397a777993cbad56`
- JavaScript: `spine-ts/build/spine-webgl.js`
- Declarations: `spine-ts/build/spine-webgl.d.ts`
- License: `spine-ts/LICENSE`, distributed at `/licenses/spine-runtimes.txt`
- Retrieved: 2026-10-15

The runtime supports skeletons exported with Spine 3.8.x. It is loaded on demand
by the operator component, so it does not enter the initial application chunk.
No ArkPets or ArkPets-Web implementation code is included.

## Local wrapper changes

The JavaScript's final reference to the unavailable source map was removed and
`export { spine }; export default spine;` was appended. The same two exports were
appended to the upstream declarations. Both named and default ESM imports
therefore resolve to the original `spine` namespace. Both files have a prepended
copy of the upstream license and an Oxlint exclusion for the generated third
party code. The executable runtime and API declarations are otherwise unchanged.

## Rendering premultiplied textures

The operator atlas PNGs contain premultiplied alpha. Upload them with
`UNPACK_PREMULTIPLY_ALPHA_WEBGL` set to `false` and use
`SkeletonRenderer.premultipliedAlpha = true`; the WebGL canvas should also use
`premultipliedAlpha: true`. This preserves the texture's existing multiplication.
`GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true` makes the upstream
texture uploader explicitly preserve that setting, including after context
restoration. Local asset filenames normalize upstream `#` characters to `-`
and update the atlas page references, so static file servers resolve them
consistently. Source revisions and transformations are recorded with the models.

## License

Spine Runtimes uses its own license, rather than an MIT-style permissive license.
The original copyright notice and license are included in both vendored files.
Read the full terms at `/licenses/spine-runtimes.txt` and the upstream license
links before distributing a derivative application.
