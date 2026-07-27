import type { Metadata } from "next";
import VillageGame from "@/components/village/game";

export const metadata: Metadata = {
  title: "Nieuw Amsterdam, 1660 — walk the first New York",
  description:
    "A browser-native 3D reconstruction of Nieuw Amsterdam, the Dutch settlement at the foot of Manhattan, as it stood around 1660. Walk the Strand, cross the Heere Gracht and climb the fort rampart.",
  // An interactive toy, not a page we want ranking against the yield content.
  robots: { index: false, follow: false },
};

export default function NieuwAmsterdamPage() {
  return <VillageGame />;
}
