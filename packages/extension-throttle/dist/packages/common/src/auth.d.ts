import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
export declare enum AuthMessageType {
    Token = 0,
    PermissionDenied = 1,
    Authenticated = 2
}
export declare const writeAuthentication: (encoder: encoding.Encoder, auth: string) => void;
export declare const writePermissionDenied: (encoder: encoding.Encoder, reason: string) => void;
export declare const writeAuthenticated: (encoder: encoding.Encoder, scope: "readonly" | "read-write") => void;
export declare const writeTokenSyncRequest: (encoder: encoding.Encoder) => void;
export declare const readAuthMessage: (decoder: decoding.Decoder, sendToken: () => void, permissionDeniedHandler: (reason: string) => void, authenticatedHandler: (scope: string) => void) => void;
