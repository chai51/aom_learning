import { NUM_REF_FRAMES, REFS_PER_FRAME } from "../define";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { REF_FRAME } from "../SyntaxStructures/Semantics";

import { assert } from "console";

/**
 * 7.8 Set frame refs process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#set-frame-refs-process)
 */
export class SetFrameRefs {
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  /**
   * 7.8 Set frame refs process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#set-frame-refs-process)
   */
  set_frame_refs() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;

    const Ref_Frame_List = [REF_FRAME.LAST2_FRAME, REF_FRAME.LAST3_FRAME, REF_FRAME.BWDREF_FRAME, REF_FRAME.ALTREF2_FRAME, REF_FRAME.ALTREF_FRAME];
    for (let i = 0; i < REFS_PER_FRAME; i++) {
      fh.ref_frame_idx[i] = -1;
    }
    fh.ref_frame_idx[REF_FRAME.LAST_FRAME - REF_FRAME.LAST_FRAME] = fh.last_frame_idx;
    fh.ref_frame_idx[REF_FRAME.GOLDEN_FRAME - REF_FRAME.LAST_FRAME] = fh.gold_frame_idx;

    let usedFrame: number[] = [];
    for (let i = 0; i < NUM_REF_FRAMES; i++) {
      usedFrame[i] = 0;
    }
    usedFrame[fh.last_frame_idx] = 1;
    usedFrame[fh.gold_frame_idx] = 1;

    let curFrameHint = 1 << (seqHeader.OrderHintBits - 1);
    let shiftedOrderHints: number[] = [];
    for (let i = 0; i < NUM_REF_FRAMES; i++) {
      shiftedOrderHints[i] = curFrameHint + fho.get_relative_dist(fh.RefOrderHint[i], fh.OrderHint);
    }
    let lastOrderHint = shiftedOrderHints[fh.last_frame_idx];
    assert(lastOrderHint < curFrameHint, "It is a requirement of bitstream conformance that lastOrderHint is strictly less than curFrameHint");

    let goldOrderHint = shiftedOrderHints[fh.gold_frame_idx];
    assert(goldOrderHint < curFrameHint, "It is a requirement of bitstream conformance that goldOrderHint is strictly less than curFrameHint");

    let ref = this.find_latest_backward(shiftedOrderHints, usedFrame, curFrameHint);
    if (ref >= 0) {
      fh.ref_frame_idx[REF_FRAME.ALTREF_FRAME - REF_FRAME.LAST_FRAME] = ref;
      usedFrame[ref] = 1;
    }
    ref = this.find_earliest_backward(shiftedOrderHints, usedFrame, curFrameHint);
    if (ref >= 0) {
      fh.ref_frame_idx[REF_FRAME.BWDREF_FRAME - REF_FRAME.LAST_FRAME] = ref;
      usedFrame[ref] = 1;
    }
    ref = this.find_earliest_backward(shiftedOrderHints, usedFrame, curFrameHint);
    if (ref >= 0) {
      fh.ref_frame_idx[REF_FRAME.ALTREF2_FRAME - REF_FRAME.LAST_FRAME] = ref;
      usedFrame[ref] = 1;
    }
    for (let i = 0; i < REFS_PER_FRAME - 2; i++) {
      let refFrame = Ref_Frame_List[i];
      if (fh.ref_frame_idx[refFrame - REF_FRAME.LAST_FRAME] < 0) {
        ref = this.find_latest_forward(shiftedOrderHints, usedFrame, curFrameHint);
        if (ref >= 0) {
          fh.ref_frame_idx[refFrame - REF_FRAME.LAST_FRAME] = ref;
          usedFrame[ref] = 1;
        }
      }
    }

    ref = -1;
    let earliestOrderHint = 0;
    for (let i = 0; i < NUM_REF_FRAMES; i++) {
      let hint = shiftedOrderHints[i];
      if (ref < 0 || hint < earliestOrderHint) {
        ref = i;
        earliestOrderHint = hint;
      }
    }
    for (let i = 0; i < REFS_PER_FRAME; i++) {
      if (fh.ref_frame_idx[i] < 0) {
        fh.ref_frame_idx[i] = ref;
      }
    }
  }

  /**
   * 7.8 Set frame refs process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#set-frame-refs-process)
   */
  find_latest_backward(shiftedOrderHints: number[], usedFrame: number[], curFrameHint: number) {
    let ref = -1;
    let latestOrderHint!: number;
    for (let i = 0; i < NUM_REF_FRAMES; i++) {
      let hint = shiftedOrderHints[i];
      if (!usedFrame[i] && hint >= curFrameHint && (ref < 0 || hint >= latestOrderHint)) {
        ref = i;
        latestOrderHint = hint;
      }
    }
    return ref;
  }

  /**
   * 7.8 Set frame refs process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#set-frame-refs-process)
   */
  find_earliest_backward(shiftedOrderHints: number[], usedFrame: number[], curFrameHint: number) {
    let ref = -1;
    let earliestOrderHint!: number;
    for (let i = 0; i < NUM_REF_FRAMES; i++) {
      let hint = shiftedOrderHints[i];
      if (!usedFrame[i] && hint >= curFrameHint && (ref < 0 || hint < earliestOrderHint)) {
        ref = i;
        earliestOrderHint = hint;
      }
    }
    return ref;
  }

  /**
   * 7.8 Set frame refs process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#set-frame-refs-process)
   */
  find_latest_forward(shiftedOrderHints: number[], usedFrame: number[], curFrameHint: number) {
    let ref = -1;
    let latestOrderHint!: number;
    for (let i = 0; i < NUM_REF_FRAMES; i++) {
      let hint = shiftedOrderHints[i];
      if (!usedFrame[i] && hint < curFrameHint && (ref < 0 || hint >= latestOrderHint)) {
        ref = i;
        latestOrderHint = hint;
      }
    }
    return ref;
  }
}
