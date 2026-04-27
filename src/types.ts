export interface RackModule {
  id: string;
  name: string;
  vendor: string;
  slug: string;
  hp: number;
  description: string;
  priceEur: number | null;
  priceUsd: number | null;
  row: number;
  col: number;
}

export interface RackInfo {
  id: string;
  name: string;
  username: string;
  modules: RackModule[];
}

export interface RawModuleData {
  id: string;
  name: string;
  slug: string;
  description: string;
  te: string;
  price_eur: string | null;
  price_usd: string | number | null;
  price_base: string | null;
  is_passive: boolean;
  is_1u: boolean;
  vendor_id: string;
  Vendor: { name: string };
  ModulesRack: {
    id: string;
    rack_id: string;
    module_id: string;
    row: string;
    col: string;
    is_inbounds: boolean;
  };
}

export interface RawRackData {
  rack: {
    Rack: {
      id: string;
      name: string;
      rows: string;
      te: string;
      user_id: string;
    };
    User: {
      id: string;
      username: string;
    };
    Module: RawModuleData[];
  };
}
