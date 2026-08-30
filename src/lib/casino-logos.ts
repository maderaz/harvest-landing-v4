// Venue wordmarks, keyed by slug.
//
// Committed at src/ root with their original filenames, so those are imported
// as they are. All eighteen are 1619x686, which is why one size serves the
// whole column.
//
// A slug with no entry renders no logo and the row falls back to its name.

import type { StaticImageData } from "next/image";

import sevenBit from "../7bit casino.png";
import bcGame from "../bcgame.png";
import betninja from "../betninja.png";
import betpanda from "../betpanda.png";
import betplay from "../betplay.png";
import casinoCrypto from "../casino crypto.png";
import casinoPunkz from "../casino punkz.png";
import coinCasino from "../coincasino.png";
import cryptorino from "../cryptorino.png";
import cybet from "../cybet casino.png";
import goldenPanda from "../goldenpanda.png";
import hyperLucky from "../hyperlucky.png";
import luckyBlock from "../luckyblock.png";
import luckyRollers from "../luckyrollers.png";
import thrill from "../thrillcasino.png";
import wave from "../wave casino.png";
import wildIo from "../wild io.png";
import wsm from "../wsm-casino.png";

export const CASINO_LOGOS: Record<string, StaticImageData> = {
  "7bit-casino": sevenBit,
  "bc-game": bcGame,
  betninja,
  "betpanda-io": betpanda,
  "betplay-io": betplay,
  "casino-crypto": casinoCrypto,
  casinopunkz: casinoPunkz,
  "coin-casino": coinCasino,
  cryptorino,
  cybet,
  "golden-panda": goldenPanda,
  "hyper-lucky": hyperLucky,
  "lucky-block": luckyBlock,
  "lucky-rollers": luckyRollers,
  thrill,
  // "wave casino.png" against our "Vave". No Wave brand exists in the data,
  // so it is mapped here and flagged for confirmation.
  vave: wave,
  "wild-io": wildIo,
  "wsm-casino": wsm,
};

export const LOGO_RATIO = 1619 / 686;
