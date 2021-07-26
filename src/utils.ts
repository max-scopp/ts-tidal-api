/**
 * Known sizing options for the album art. These are pre-cached by tidal.
 * There is no dynamic resizing of images known at the time of writing.
 */
export enum SizeOptions {
    Thumbnail = 80,
    Normal = 640,
    Large = 1280,
}

/**
 * Internal helper method to resolve the album art.
 * Prefer `TidalManager.getCoverURL()` over this method.
 *
 * @param track
 * @param width
 * @param height
 */
export function getAlbumArt(coverId: string, size: SizeOptions) {
    const coverIdPath = coverId.replace(/-/g, "/");

    return `https://resources.tidal.com/images/${coverIdPath}/${size}x${size}.jpg`;
}
