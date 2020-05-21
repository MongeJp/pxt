import * as core from "./core";
import * as cloudsync from "./cloudsync";

import U = pxt.U

interface GEntry {
    "id": string;
    "name": string;
    "version": string; // "7",
    "modifiedTime": string; // "2018-07-19T22:26:32.802Z"
}

export class Provider extends cloudsync.ProviderBase implements cloudsync.Provider {
    private entryCache: pxt.Map<GEntry> = {}

    private oauthWindow_: any;
    private oauthInterval_: any;

    constructor() {
        super("googledrive", lf("Google Drive"), "xicon googledrive", "https://www.googleapis.com")
    }

    login() {
        let p = this.loginInner()
        p.scope = "https://www.googleapis.com/auth/drive.appfolder https://www.googleapis.com/auth/userinfo.profile"
        let url = core.stringifyQueryString("https://accounts.google.com/o/oauth2/v2/auth", p)
        if (p.redirect) {
            // Redirect
            window.location.href = url
        } else {
            // Pop out
            const popupCallback = () => {
                pxt.BrowserUtils.changeHash("", true);
                window.location.reload();
            }
            const that = this;
            that.oauthWindow_ = pxt.BrowserUtils.popupWindow(url, lf("Login with Google"), 483, 600);
            that.oauthInterval_ = window.setInterval(() => {
                if (that.oauthWindow_.closed) {
                    window.clearInterval(that.oauthInterval_);
                    popupCallback();
                }
            }, 1000);
        }
    }

    getUserInfoAsync() {
        return this.getJsonAsync("/oauth2/v1/userinfo")
            .then(resp => ({
                name: (resp.name as string) || lf("{0} User", this.friendlyName),
                id: resp.id,
                photo: resp.picture
            }))
    }

    listAsync() {
        return this.getJsonAsync("/drive/v3/files?" +
            "pageSize=1000&" +
            "fields=files(id,name,version,modifiedTime)&" +
            "spaces=appDataFolder"
            // "q=" + encodeURIComponent("name contains '" + this.fileSuffix() + "'")
        )
            .then(lst => {
                let res: cloudsync.FileInfo[] = []
                for (let r of (lst.files || []) as GEntry[]) {
                    this.entryCache[r.id] = r
                    res.push({
                        id: r.id,
                        name: r.name,
                        version: r.version,
                        updatedAt: this.parseTime(r.modifiedTime)
                    })
                }
                return res
            })
    }

    async downloadAsync(id: string): Promise<cloudsync.FileInfo> {
        let cached = this.entryCache[id]
        let resp = await this.reqAsync({ url: "/drive/v3/files/" + cached.id + "?alt=media" })
        return {
            id: cached.id,
            version: cached.version,
            name: cached.name,
            updatedAt: this.parseTime(cached.modifiedTime),
            content: JSON.parse(resp.text)
        }
    }


    async uploadAsync(id: string, prevVersion: string, files: pxt.Map<string>): Promise<cloudsync.FileInfo> {

        if (!id) {
            let tmp = await this.reqAsync({
                url: "/drive/v3/files",
                method: "POST",
                data: {
                    // the user will never see this title anyways
                    "name": pxtc.U.guidGen(),
                    "mimeType": "application/json",
                    "parents": ["appDataFolder"]
                }
            })

            if (tmp.statusCode >= 300)
                this.syncError(lf("Can't create file in {0}", this.friendlyName))
            id = tmp.json.id
        }

        let resp = await this.reqAsync({
            url: "/upload/drive/v3/files/" + id + "?uploadType=media" +
                "&fields=id,name,version,modifiedTime",
            method: "PATCH",
            data: JSON.stringify(files, null, 1),
        })

        if (resp.statusCode >= 300)
            this.syncError(lf("Can't upload file to {0}", this.friendlyName))

        let cached = resp.json as GEntry
        this.entryCache[cached.id] = cached

        return {
            id: cached.id,
            version: cached.version,
            updatedAt: U.nowSeconds(),
            name: cached.name,
        }
    }

    async updateAsync(id: string, newName: string): Promise<void> {
        // NOP
    }

    async deleteAsync(id: string): Promise<void> {
        let resp = await this.reqAsync({
            url: "/drive/v3/files/" + id,
            method: "DELETE",
        })

        if (resp.statusCode != 204)
            this.syncError(lf("Can't delete {0} file", this.friendlyName))
    }
}
