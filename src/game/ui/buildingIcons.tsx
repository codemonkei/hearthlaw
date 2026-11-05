import type { ReactNode } from "react";
import {
  Anvil,
  Axe,
  CookingPot,
  Compass,
  Cross,
  House,
  Package,
  Rabbit,
  Recycle,
  Shovel,
  Tent,
  Warehouse,
  Wind,
} from "lucide-react";
import type { BuildingKind } from "@/game/sim/types";

/**
 * One icon per building, drawn like the resource bar: 16px line icons, amber for what feeds
 * the fire and the pots (fuel, meals, heat), mist for everything else.
 */
export function buildingIcon(kind: BuildingKind): ReactNode {
  const warm = "size-4 shrink-0 text-ember";
  const plain = "size-4 shrink-0 text-mist";
  switch (kind) {
    case "tent":
      return <Tent className={plain} />;
    case "hut":
      return <House className={plain} />;
    case "longhouse":
      return <Warehouse className={plain} />;
    case "mess":
      return <CookingPot className={warm} />;
    case "trappers":
      return <Rabbit className={plain} />;
    case "peat":
      return <Shovel className={warm} />;
    case "wood":
      return <Axe className={plain} />;
    case "salvage":
      return <Recycle className={plain} />;
    case "ironworks":
      return <Anvil className={plain} />;
    case "infirmary":
      return <Cross className={plain} />;
    case "survey":
      return <Compass className={plain} />;
    case "depot":
      return <Package className={plain} />;
    case "vent":
      return <Wind className={warm} />;
  }
}
