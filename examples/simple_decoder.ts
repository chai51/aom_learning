import * as fs from "fs";
import { BitReader } from "../src/Conventions";
import { Obu } from "../src/SyntaxStructures/Obu";
import { readIVFFrame, readIVFHeader } from "./ivfparse";

async function run(filename: string) {
  let buf = await fs.readFileSync(filename);
  let yuvFilename = filename.replace(".ivf", ".yuv");

  let reader = new BitReader(null as any);
  reader.initialize(buf);

  const ivfHeader = readIVFHeader(reader);

  let index = 0;
  let obu = new Obu();

  let file = fs.openSync(yuvFilename, "w");
  obu.onFilmGrainFrame = (frame: number[][][]) => {
    index++;
    const planeY = 0;
    const planeU = 1;
    const planeV = 2;

    for (let h2 = 0; h2 < frame[planeY].length; h2++) {
      fs.writeSync(file, Uint8Array.from(frame[planeY][h2]));
    }
    for (let h2 = 0; h2 < frame[planeU].length; h2++) {
      fs.writeSync(file, Uint8Array.from(frame[planeU][h2]));
    }
    for (let h2 = 0; h2 < frame[planeV].length; h2++) {
      fs.writeSync(file, Uint8Array.from(frame[planeV][h2]));
    }
  };
  for (let i = 0; i < ivfHeader.num_frames; i++) {
    const ivfFrame = readIVFFrame(reader);

    obu.frame_unit(reader.byte(ivfFrame.frame_size), ivfFrame.frame_size);
  }
  fs.close(file);
  console.info(`Play: ffplay -f rawvideo -pix_fmt yuv420p -s ${ivfHeader.width}x${ivfHeader.width} ${yuvFilename}`);
}

run("./av1-film_grain.ivf");
