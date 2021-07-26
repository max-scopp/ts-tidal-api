import fetch from "node-fetch";
import {
    Credentials,
    FavoritesResult,
    QualityMode,
    QueryTypeString,
    SearchResult,
    Session,
    StreamingResult,
    TidalInitialization,
    Track,
} from "./types";
import { getAlbumArt, SizeOptions } from "./utils";

const baseURL = "https://api.tidalhifi.com/v1";

function formUrlEncoded(_object?: { [key: string]: any }) {
    const t = _object || {};
    return Object.keys(t).reduce(
        (p, c) => p + `&${c}=${encodeURIComponent(t[c])}`,
        ""
    );
}

/**
 * Rewrite of https://github.com/lucaslg26/TidalAPI
 * It was kind of shitty and I needed additional API's.
 */
export class TidalManager {
    session: null | Session = null;
    credentials: Credentials;

    quality: QualityMode;

    constructor(init: TidalInitialization) {
        if (!init) {
            throw new Error(
                "Unable to init TidalManager, no init object given!"
            );
        }

        const { quality, username, password } = init;

        if (!(quality || username || password)) {
            throw new Error(
                "Unable to init TidalManager, one (or more) of the required values are missing: "
            );
        }

        this.credentials = {
            username,
            password,
        };
        this.quality = quality;

        this.tryLogin();
    }

    destroy() {
        this.session = null;
    }

    get userId() {
        return this.session?.userId;
    }

    /**
     * Try to login with the local credentials.
     * This method is called in class construction
     * and is usually not needed to be called manually.
     */
    async tryLogin() {
        const response = await fetch(baseURL + "/login/username", {
            method: "POST",
            headers: {
                "X-Tidal-Token": "wc8j_yBJd20zOmx0",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formUrlEncoded(this.credentials),
        });

        this.session = await response.json();
    }

    /**
     * Base request method for all api calls.
     *
     * @param url
     * @param params
     * @param method The http verb to make the request with, prefer UPPERCASE casing.
     * @param additionalHeaders
     * @param setParamsAsFormData if true, prefer `params` as FormData body rather than url params.
     * @returns
     */
    protected async _request(
        url: string,
        params?: { [key: string]: any },
        method?: string,
        additionalHeaders?: { [key: string]: any },
        setParamsAsFormData?: boolean
    ) {
        if (!this.session) {
            throw new Error("Not logged in.");
        }

        const useMethod = method || "GET";
        const isGET = useMethod.match(/GET/i);

        const additionalParams = isGET ? "?" + formUrlEncoded(params) : "";
        const requestUrl = baseURL + url + additionalParams;

        const response = await fetch(requestUrl, {
            method: useMethod,
            headers: {
                Origin: "http://listen.tidal.com",
                "X-Tidal-SessionId": this.session.sessionId,
                ...additionalHeaders,
            },
            body: !isGET
                ? setParamsAsFormData
                    ? formUrlEncoded(params)
                    : JSON.stringify(params)
                : undefined,
        });

        return response.json();
    }

    /**
     * Search a query term with paging and type support.
     * If no type is provided, the api will respond with all:
     * tracks, albums, artists, etc.
     *
     * @param type if null, all criterias are included.
     * @param query
     * @param limit
     */
    async search(
        type: QueryTypeString[] | null,
        query: string,
        limit: number = 100,
        offset: number = 0
    ): Promise<SearchResult> {
        return this._request("/search", {
            type: type ? type.join() : null,
            query,
            limit,
            offset,
            countryCode: this.session?.countryCode,
        });
    }

    /**
     * Return the URL to an cover from an cover identifier or track object.
     *
     * @param trackOrCoverId
     * @param size
     * @returns
     */
    getCoverURL(
        trackOrCoverId: Track | string,
        size: SizeOptions = SizeOptions.Normal
    ) {
        let coverId;
        if (typeof trackOrCoverId === "string") {
            coverId = trackOrCoverId;
        } else {
            coverId = trackOrCoverId.album.cover;
        }

        return getAlbumArt(coverId, size);
    }

    /**
     * Get the favorite tracks of an user. If no userId is provided, the logged in user is used.
     * Does not respond with success if privacy settings apply.
     *
     * @param userId
     * @param limit
     * @param offset
     * @param order
     * @param orderDirection
     * @returns
     */
    async getFavorites(
        userId?: string,
        limit?: number,
        offset?: number,
        order?: "DATE" | "NAME" | "ARTIST" | "ALBUM" | "LENGTH",
        orderDirection?: "DESC" | "ASC"
    ): Promise<FavoritesResult> {
        return this._request(
            `/users/${userId || this.userId}/favorites/tracks`,
            {
                limit,
                offset,
                order,
                orderDirection,
                countryCode: this.session?.countryCode,
            }
        );
    }

    /**
     * Retrieve all playlists from an given userId.
     * If no userId is provided, the logged in user is used.
     * @param userId
     * @param limit
     * @param offset
     * @returns
     */
    async getPlaylists(
        userId?: number,
        limit: number = 100,
        offset: number = 0
    ) {
        const playlistURL =
            "/users/" +
            encodeURIComponent(userId || this.userId || "") +
            "/playlists";

        return this._request(playlistURL, {
            limit,
            offset,
        });
    }

    /**
     * Retrieve all known track details of an given trackId.
     *
     * NOTE: Response interface is missing! Inspect response manually.
     *
     * @param trackId
     * @returns
     */
    async getTrackInfo(trackId: string) {
        return this._request("/tracks/" + trackId);
    }

    /**
     * Let Tidal generate a mix-playlist based on an given trackId.
     * Usually called when a playlist of queue ends.
     *
     * NOTE: Response interface is missing! Inspect response manually.
     *
     * @param trackId
     * @returns
     */
    async getMixIDFromTrack(trackId: string) {
        return this._request(`/tracks/${trackId}/mix`, {
            countryCode: this.session?.countryCode,
        });
    }

    /**
     * Retrieve an previously generated mix by it's mixId again.
     *
     * NOTE: Response interface is missing! Inspect response manually.
     *
     * @param mixId
     * @returns
     */
    async getMix(mixId: string) {
        return this._request(`/mixes/${mixId}/items`, {
            countryCode: this.session?.countryCode,
        });
    }

    /**
     * Return the URL to play/stream an Track or trackId.
     * Use `getVideoStreamURL` if you prefer the video for the given track/trackId.
     *
     * May fail if the audio/video is not categorized right or does not exist by tidal.
     *
     * @param idOrTrack
     * @param quality If not provided, the quality mode of which the class has been constructed is used. This is used to overwrite that behaviour in case network conditions changes.
     */
    async getStreamURL(
        idOrTrack: string | Track,
        quality?: QualityMode
    ): Promise<StreamingResult> {
        const trackId =
            typeof idOrTrack === "string" ? idOrTrack : idOrTrack.id;

        return this._request(`/tracks/${trackId}/streamUrl`, {
            soundQuality: quality || this.quality,
        });
    }

    /**
     * Return the URL to play/stream the Video (with audio) to an specific track or trackId.
     * Use `getStreamURL` if you prefer HIGH/LOSSLESS quality or audio only.
     *
     * May fail if the audio/video is not categorized right or does not exist by tidal.
     *
     * @param idOrTrack
     * @returns
     */
    getVideoStreamURL(idOrTrack: string | Track): Promise<StreamingResult> {
        const trackId =
            typeof idOrTrack === "string" ? idOrTrack : idOrTrack.id;

        return this._request(`/videos/${trackId}/streamUrl`);
    }
}
