declare module "opus-recorder" {
  type Opts = { encoderPath: string; sourceNode?: MediaStreamAudioSourceNode; numberOfChannels?: number; encoderSampleRate?: number; encoderApplication?: number; encoderBitRate?: number; streamPages?: boolean; maxFramesPerPage?: number; mediaTrackConstraints?: MediaTrackConstraints | boolean; encoderComplexity?: number };
  export default class Recorder {
    constructor(opts: Opts);
    static isRecordingSupported(): boolean;
    start(): Promise<void>; stop(): Promise<void>; pause(flush?: boolean): Promise<void> | void; resume(): void; close(): Promise<void>;
    ondataavailable: (data: Uint8Array) => void;
    onstop?: () => void;
  }
}
