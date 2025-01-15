import { assert } from "console";
import { EventEmitter } from "stream";
import { BitReader } from "../Conventions";
import { FrameHeaderObu, FrameObu } from "./FrameHeaderObu";
import { MetadataObu } from "./MetadataObu";
import { OBU_HEADER_TYPE } from "./Semantics";
import { SequenceHeaderObu } from "./SequenceHeaderObu";
import { TileGroupObu } from "./TileGroupObu";
import { TileListObu } from "./TileListObu";

import { DecodeFrameWrapup } from "../Decoding/DecodeFrameWrapup";
import { LargeScaleTileDecoding } from "../Decoding/LargeScaleTileDecoding";
import { OrderingOfObus } from "../Decoding/OrderingOfObus";

import { CDEF } from "../Decoding/cdef";
import { InverseTransform } from "../Decoding/InverseTransform";
import { LoopFilter } from "../Decoding/LoopFilter";
import { LoopRestoration } from "../Decoding/LoopRestoration";
import { MotionFieldEstimation, ReferenceFrameLoading, ReferenceFrameUpdate } from "../Decoding/MotionFieldEstimation";
import { MotionFieldMotionVectorStorage } from "../Decoding/MotionFieldMotionVectorStorage";
import { MotionVectorPrediction } from "../Decoding/MotionVectorPrediction";
import { Output } from "../Decoding/Output";
import { Prediction } from "../Decoding/Prediction";
import { ReconstructionAndDequantization } from "../Decoding/ReconstructionAndDequantization";
import { SetFrameRefs } from "../Decoding/SetFrameRefs";
import { Upscaling } from "../Decoding/Upscaling";

import { CdfEncoded } from "../Parsing/CdfEncoded";
import { SymbolDecoder } from "../Parsing/SymbolDecoder";

/**
 * 5.3 OBU syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#obu-syntax)
 */
export class Obu extends EventEmitter {
  obuHeader: ObuHeader;
  private decoder: AV1Decoder;

  onFrame?: (frame: number[][][]) => void;

  constructor() {
    super();
    this.obuHeader = {
      obu_extension_header: {},
    } as any;

    this.decoder = { obu: this } as any;
    this.decoder.reader = new BitReader(this.decoder);

    this.decoder.sequenceHeaderObu = new SequenceHeaderObu(this.decoder);
    this.decoder.temporalDelimiterObu = new TemporalDelimiterObu(this.decoder);
    this.decoder.paddingObu = new PaddingObu(this.decoder);
    this.decoder.metadataObu = new MetadataObu(this.decoder);
    this.decoder.frameHeaderObu = new FrameHeaderObu(this.decoder);
    this.decoder.frameObu = new FrameObu(this.decoder);
    this.decoder.tileGroupObu = new TileGroupObu(this.decoder);
    this.decoder.tileListObu = new TileListObu(this.decoder);

    this.decoder.largeScaleTileDecoding = new LargeScaleTileDecoding(this.decoder);
    this.decoder.decodeFrameWrapup = new DecodeFrameWrapup(this.decoder);
    this.decoder.orderingOfObus = new OrderingOfObus(this.decoder);
    this.decoder.setFrameRefs = new SetFrameRefs(this.decoder);
    this.decoder.motionFieldEstimation = new MotionFieldEstimation(this.decoder);
    this.decoder.motionVectorPrediction = new MotionVectorPrediction(this.decoder);
    this.decoder.prediction = new Prediction(this.decoder);
    this.decoder.reconstructionAndDequantization = new ReconstructionAndDequantization(this.decoder);
    this.decoder.inverseTransform = new InverseTransform(this.decoder);
    this.decoder.loopFilter = new LoopFilter(this.decoder);
    this.decoder.cdef = new CDEF(this.decoder);
    this.decoder.upscaling = new Upscaling(this.decoder);
    this.decoder.loopRestoration = new LoopRestoration(this.decoder);
    this.decoder.output = new Output(this.decoder);
    this.decoder.motionFieldMotionVectorStorage = new MotionFieldMotionVectorStorage(this.decoder);
    this.decoder.referenceFrameUpdate = new ReferenceFrameUpdate(this.decoder);
    this.decoder.referenceFrameLoading = new ReferenceFrameLoading(this.decoder);

    this.decoder.symbolDecoder = new SymbolDecoder(this.decoder);
    this.decoder.cdfEncoded = new CdfEncoded(this.decoder);
  }

  frame_unit(buf: Buffer, sz: number) {
    const reader = this.decoder.reader;
    const obu = this.decoder.obu;
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const p = this.decoder.prediction;

    reader.initialize(buf);
    while (sz > 0) {
      let startPosition = reader.get_position();
      this.open_bitstream_unit(sz);
      let obu_length = (reader.get_position() - startPosition) / 8;
      sz -= obu_length;
    }

    if (obu.onFrame) {
      let ct = this.decoder.output.cameraTile;
      obu.onFrame([ct.OutY, ct.OutU, ct.OutV]);
    }
  }

  /**
   * 5.3.1 OBU syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-obu-syntax)
   */
  open_bitstream_unit(sz: number) {
    const reader = this.decoder.reader;
    const oh = this.obuHeader;
    const oeh = this.obuHeader.obu_extension_header;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;

    this.obu_header();
    if (oh.obu_has_size_field) {
      oh.obu_size = reader.leb128();
    } else {
      oh.obu_size = sz - 1 - oh.obu_extension_flag;
    }

    let startPosition = reader.get_position();
    if (
      oh.obu_type != OBU_HEADER_TYPE.OBU_SEQUENCE_HEADER &&
      oh.obu_type != OBU_HEADER_TYPE.OBU_TEMPORAL_DELIMITER &&
      seqHeader.OperatingPointIdc != 0 &&
      oh.obu_extension_flag == 1
    ) {
      let inTemporalLayer = (seqHeader.OperatingPointIdc >> oeh.temporal_id) & 1;
      let inSpatialLayer = (seqHeader.OperatingPointIdc >> (oeh.spatial_id + 8)) & 1;
      if (!inTemporalLayer || !inSpatialLayer) {
        drop_obu();
        return;
      }
    }

    if (oh.obu_type == OBU_HEADER_TYPE.OBU_SEQUENCE_HEADER) {
      this.decoder.sequenceHeaderObu.sequence_header_obu();
    } else if (oh.obu_type == OBU_HEADER_TYPE.OBU_TEMPORAL_DELIMITER) {
      this.decoder.temporalDelimiterObu.temporal_delimiter_obu();
    } else if (oh.obu_type == OBU_HEADER_TYPE.OBU_FRAME_HEADER) {
      this.decoder.frameHeaderObu.frame_header_obu();
    } else if (oh.obu_type == OBU_HEADER_TYPE.OBU_REDUNDANT_FRAME_HEADER) {
      this.decoder.frameHeaderObu.frame_header_obu();
    } else if (oh.obu_type == OBU_HEADER_TYPE.OBU_TILE_GROUP) {
      this.decoder.tileGroupObu.tile_group_obu(oh.obu_size);
    } else if (oh.obu_type == OBU_HEADER_TYPE.OBU_METADATA) {
      this.decoder.metadataObu.metadata_obu();
    } else if (oh.obu_type == OBU_HEADER_TYPE.OBU_FRAME) {
      this.decoder.frameObu.frame_obu(oh.obu_size);
    } else if (oh.obu_type == OBU_HEADER_TYPE.OBU_TILE_LIST) {
      this.decoder.tileListObu.tile_list_obu();
    } else if (oh.obu_type == OBU_HEADER_TYPE.OBU_PADDING) {
      this.decoder.paddingObu.padding_obu(oh.obu_size);
    } else {
      reserved_obu();
    }
    let currentPosition = reader.get_position();
    let payloadBits = currentPosition - startPosition;
    if (oh.obu_size > 0 && oh.obu_type != OBU_HEADER_TYPE.OBU_TILE_GROUP && oh.obu_type != OBU_HEADER_TYPE.OBU_TILE_LIST && oh.obu_type != OBU_HEADER_TYPE.OBU_FRAME) {
      this.trailing_bits(oh.obu_size * 8 - payloadBits);
    }

    assert(reader.get_position() == startPosition + oh.obu_size * 8, "There is unread data.");
  }

  /**
   * 5.3.2 OBU header syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#obu-header-syntax)
   */
  obu_header() {
    const reader = this.decoder.reader;
    const oh = this.obuHeader;
    const oeh = this.obuHeader.obu_extension_header;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;

    let obu_forbidden_bit = reader.f(1);
    assert(obu_forbidden_bit == 0, "obu_forbidden_bit must be set to 0");
    oh.obu_type = reader.f(4);
    oh.obu_extension_flag = reader.f(1);
    if (seqHeader.OperatingPointIdc == 0) {
      assert(
        oh.obu_extension_flag == 0,
        "It is a requirement of bitstream conformance that if OperatingPointIdc is equal to 0, then obu_extension_flag is equal to 0 for all OBUs that follow this sequence header until the next sequence header."
      );
    }
    oh.obu_has_size_field = reader.f(1);
    let obu_reserved_1bit = reader.f(1);
    if (oh.obu_extension_flag) {
      this.obu_extension_header();
    } else {
      oeh.temporal_id = 0;
      oeh.spatial_id = 0;
    }
  }

  /**
   * 5.3.3 OBU extension header syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#obu-extension-header-syntax)
   */
  obu_extension_header() {
    const extension = this.obuHeader.obu_extension_header;
    const reader = this.decoder.reader;

    extension.temporal_id = reader.f(3);
    extension.spatial_id = reader.f(2);
    let extension_header_reserved_3bits = reader.f(3);
  }

  /**
   * 5.3.4 Trailing bits syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#trailing-bits-syntax)
   */
  trailing_bits(nbBits: number) {
    const reader = this.decoder.reader;

    let trailing_one_bit = reader.f(1);
    nbBits--;
    while (nbBits > 0) {
      let trailing_zero_bit = reader.f(1);
      nbBits--;
    }
  }

  /**
   * 5.3.5 Byte alignment syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#byte-alignment-syntax)
   */
  byte_alignment() {
    const reader = this.decoder.reader;
    while (reader.get_position() & 7) {
      let zero_bit = reader.f(1);
    }
  }
}

/**
 * 5.4 Reserved OBU syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reserved-obu-syntax)
 */
function reserved_obu() {}

/**
 * 5.6 Temporal delimiter obu syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#temporal-delimiter-obu-syntax)
 */
export class TemporalDelimiterObu {
  SeenFrameHeader: number;

  constructor(d: AV1Decoder) {
    this.SeenFrameHeader = -1;
  }

  temporal_delimiter_obu() {
    this.SeenFrameHeader = 0;
  }
}

/**
 * 5.7 Padding OBU syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#padding-obu-syntax)
 */
export class PaddingObu {
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  padding_obu(obu_padding_length: number) {
    const reader = this.decoder.reader;
    for (let i = 0; i < obu_padding_length; i++) {
      let obu_padding_byte = reader.f(8);
    }
  }
}

/**
 * 6.2.1 General OBU semantics
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-obu-semantics)
 */
function drop_obu() {}

interface ObuHeader {
  /**
   * 6.2.1 General OBU semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-obu-semantics)
   */
  obu_size: number;

  /**
   * 6.2.2 OBU header semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#obu-header-semantics)
   */
  obu_type: OBU_HEADER_TYPE;
  obu_extension_flag: number;
  obu_has_size_field: number;

  /**
   * 6.2.2 OBU extension header semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#obu-extension-header-semantics)
   */
  obu_extension_header: {
    temporal_id: number;
    spatial_id: number;
  };
}

export interface AV1Decoder {
  reader: BitReader;
  obu: Obu;
  sequenceHeaderObu: SequenceHeaderObu;
  temporalDelimiterObu: TemporalDelimiterObu;
  paddingObu: PaddingObu;
  metadataObu: MetadataObu;
  frameHeaderObu: FrameHeaderObu;
  frameObu: FrameObu;
  tileGroupObu: TileGroupObu;
  tileListObu: TileListObu;
  largeScaleTileDecoding: LargeScaleTileDecoding;
  decodeFrameWrapup: DecodeFrameWrapup;
  orderingOfObus: OrderingOfObus;
  setFrameRefs: SetFrameRefs;
  motionFieldEstimation: MotionFieldEstimation;
  motionVectorPrediction: MotionVectorPrediction;
  prediction: Prediction;
  reconstructionAndDequantization: ReconstructionAndDequantization;
  inverseTransform: InverseTransform;
  loopFilter: LoopFilter;
  cdef: CDEF;
  upscaling: Upscaling;
  loopRestoration: LoopRestoration;
  output: Output;
  motionFieldMotionVectorStorage: MotionFieldMotionVectorStorage;
  referenceFrameUpdate: ReferenceFrameUpdate;
  referenceFrameLoading: ReferenceFrameLoading;
  symbolDecoder: SymbolDecoder;
  cdfEncoded: CdfEncoded;
}
