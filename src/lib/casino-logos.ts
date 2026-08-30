// Venue wordmarks, keyed by slug.
//
// Committed at src/ root with their original filenames, so those are imported
// as they are. They all share one aspect ratio, which is why one size serves
// the whole column.
//
// This file decides the ranking. A venue with no wordmark here is not listed:
// see hasLogo below.

import type { StaticImageData } from "next/image";

import sevenBit from "../7bit casino.png";
import bcGame from "../bcgame.png";
import betfury from "../betfury.png";
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
  betfury,
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
  // The file is named "wave casino.png" and carries Vave's wordmark.
  vave: wave,
  "wild-io": wildIo,
  "wsm-casino": wsm,
};

export const LOGO_RATIO = 1619 / 686;

/**
 * Whether a venue can appear in the ranking.
 *
 * The table is a column of wordmarks and one row of bare text reads as a
 * mistake, so the logo set is the membership list. Adding a file and a line
 * above adds a row; nothing else has to be edited.
 */
export function hasLogo(slug: string): boolean {
  return slug in CASINO_LOGOS;
}
