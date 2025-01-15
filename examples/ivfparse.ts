import { BitReader } from "../src/Conventions";

export interface IVFHeader {
  magic: string;
  version: number;
  header_size: number;
  fourcc: string;
  width: number;
  height: number;
  framerate_numerator: number;
  framerate_denominator: number;
  num_frames: number;
  reserved: number;
}

export interface IVFFrame {
  frame_size: number;
  timestamp: number;
}

export function readIVFHeader(reader: BitReader): IVFHeader {
  let ivfHeader: IVFHeader = {} as any;
  ivfHeader.magic = reader.string(4);
  ivfHeader.version = reader.numberLE(2);
  ivfHeader.header_size = reader.numberLE(2);
  ivfHeader.fourcc = reader.string(4);
  ivfHeader.width = reader.numberLE(2);
  ivfHeader.height = reader.numberLE(2);
  ivfHeader.framerate_numerator = reader.numberLE(4);
  ivfHeader.framerate_denominator = reader.numberLE(4);
  ivfHeader.num_frames = reader.numberLE(4);
  ivfHeader.reserved = reader.numberLE(4);
  reader.skip((ivfHeader.header_size - 32) * 8);
  return ivfHeader;
}

export function readIVFFrame(reader: BitReader): IVFFrame {
  let ivfFrame: IVFFrame = {} as any;
  ivfFrame.frame_size = reader.numberLE(4);
  ivfFrame.timestamp = reader.numberLE(8);
  return ivfFrame;
}
