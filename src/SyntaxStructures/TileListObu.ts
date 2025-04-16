import { Array4D } from "../Conventions";
import { INT8_MAX } from "../define";
import { AV1Decoder } from "./Obu";

import { assert } from "console";

/**
 * 5.12 Tile list OBU syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tile-list-obu-syntax)
 */
export class TileListObu {
  tileList: TileList;
  private decoder: AV1Decoder;
  constructor(d: AV1Decoder) {
    this.tileList = {
      tile_list_entry: {},
    } as any;

    this.decoder = d;
  }

  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-tile-list-obu-syntax)
  tile_list_obu() {
    const reader = this.decoder.reader;
    const tl = this.tileList;

    tl.output_frame_width_in_tiles_minus_1 = reader.f(8);
    tl.output_frame_height_in_tiles_minus_1 = reader.f(8);
    tl.tile_count_minus_1 = reader.f(16);
    assert(tl.tile_count_minus_1 <= 511, "It is a requirement of bitstream conformance that tile_count_minus_1 is less than or equal to 511.");
    for (let tile = 0; tile <= tl.tile_count_minus_1; tile++) {
      this.tile_list_entry(tile);
    }
  }

  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tile-list-entry-syntax)
  tile_list_entry(tile: number) {
    const reader = this.decoder.reader;
    const ti = this.decoder.frameHeaderObu.frameHeader.tile_info;

    const tle = this.tileList.tile_list_entry;
    const lstd = this.decoder.largeScaleTileDecoding;

    tle.anchor_frame_idx = reader.f(8);
    assert(tle.anchor_frame_idx <= INT8_MAX, "It is a requirement of bitstream conformance that anchor_frame_idx is less than or equal to 127.");
    tle.anchor_tile_row = reader.f(8);
    assert(tle.anchor_tile_row < ti.TileRows, "It is a requirement of bitstream conformance that anchor_tile_row is less than TileRows.");
    tle.anchor_tile_col = reader.f(8);
    assert(tle.anchor_tile_col < ti.TileCols, "It is a requirement of bitstream conformance that anchor_tile_col is less than TileCols.");
    tle.tile_data_size_minus_1 = reader.f(16);
    let N = 8 * (tle.tile_data_size_minus_1 + 1);
    tle.coded_tile_data = reader.byte(N);
    lstd.general(Array4D<number>(null, 64, 64, 64), tile);
  }
}

interface TileList {
  output_frame_width_in_tiles_minus_1: number;
  output_frame_height_in_tiles_minus_1: number;
  tile_count_minus_1: number;
  tile_list_entry: {
    anchor_frame_idx: number;
    anchor_tile_row: number;
    anchor_tile_col: number;
    tile_data_size_minus_1: number;
    coded_tile_data: Uint8Array;
  };
}
