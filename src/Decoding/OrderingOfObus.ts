import { AV1Decoder } from "../SyntaxStructures/Obu";

import { FRAME_TYPE } from "../SyntaxStructures/Semantics";

import { assert } from "console";

/**
 * 7.5 Ordering of OBUs
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#ordering-of-obus)
 */
export class OrderingOfObus {
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#ordering-of-obus)
  ordering_of_obus() {
    const oh = this.decoder.obu.obuHeader;
    const oeh = oh.obu_extension_header;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.decoder.frameHeaderObu.frameHeader;

    assert(
      fh.frame_type == FRAME_TYPE.KEY_FRAME && fh.show_frame == 1 && fh.show_existing_frame == 0 && oeh.temporal_id == 0,
      "The first frame header has frame_type equal to KEY_FRAME, show_frame equal to 1, show_existing_frame equal to 0, and temporal_id equal to 0"
    );
    if (seqHeader.OperatingPointIdc == 0) {
      assert(fh.frame_type == FRAME_TYPE.KEY_FRAME && fh.show_frame == 1, "The first frame header must have frame_type equal to KEY_FRAME and show_frame equal to 1");
    } else {
      assert(
        fh.frame_type == FRAME_TYPE.KEY_FRAME && fh.show_frame == 1,
        "The first frame header that will be decoded must have frame_type equal to KEY_FRAME and show_frame equal to 1"
      );
      assert(
        fh.show_frame == 1 || fh.show_existing_frame == 1,
        "Every layer that has a coded frame in a temporal unit must have exactly one shown frame that is the last frame of that layer in the temporal unit"
      );
    }
  }
}
