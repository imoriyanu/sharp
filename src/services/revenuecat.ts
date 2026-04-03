import Constants from 'expo-constants';

// ===== RevenueCat Service =====
// All RevenueCat SDK calls are isolated here.
// This module does NOT manage premium state — it feeds into premium.ts.
// Native module is NOT available in Expo Go — all calls are guarded.

const API_KEY = Constants.expoConfig?.extra?.revenuecatApiKey || process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || '';

let _configured = false;
let Purchases: any = null;
let LOG_LEVEL: any = null;

// Safely import the native module — returns null in Expo Go
function loadPurchasesModule(): boolean {
  if (Purchases) return true;
  try {
    const mod = require('react-native-purchases');
    Purchases = mod.default;
    LOG_LEVEL = mod.LOG_LEVEL;
    return true;
  } catch {
    return false;
  }
}

// ===== Init — call once at app startup =====

export async function initRevenueCat(): Promise<void> {
  if (_configured || !API_KEY) {
    if (__DEV__ && !API_KEY) console.warn('RevenueCat: No API key configured — purchases disabled');
    return;
  }
  if (!loadPurchasesModule()) {
    __DEV__ && console.warn('RevenueCat: Native module not available (Expo Go?) — purchases disabled');
    return;
  }
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: API_KEY });
    _configured = true;
  } catch (e) {
    __DEV__ && console.warn('RevenueCat: configure failed:', e);
  }
}

export function isRevenueCatConfigured(): boolean {
  return _configured;
}

// ===== User identity — link to Supabase user ID =====

export async function identifyUser(userId: string): Promise<void> {
  if (!_configured) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    __DEV__ && console.warn('RevenueCat: logIn failed:', e);
  }
}

export async function logoutUser(): Promise<void> {
  if (!_configured) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    __DEV__ && console.warn('RevenueCat: logOut failed:', e);
  }
}

// ===== Entitlement check — is the user premium? =====

export async function checkEntitlement(): Promise<boolean> {
  if (!_configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active['pro'] !== undefined;
  } catch (e) {
    __DEV__ && console.warn('RevenueCat: entitlement check failed:', e);
    return false;
  }
}

// ===== Offerings — fetch real prices from the store =====

export async function getOfferings(): Promise<any | null> {
  if (!_configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (e) {
    __DEV__ && console.warn('RevenueCat: getOfferings failed:', e);
    return null;
  }
}

// ===== Purchase — returns true on success, false on cancellation =====

export async function purchasePackage(pkg: any): Promise<{ success: boolean; info: any }> {
  if (!_configured) return { success: false, info: null };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const hasPro = customerInfo.entitlements.active['pro'] !== undefined;
    return { success: hasPro, info: customerInfo };
  } catch (e: any) {
    // User cancelled — not an error
    if (e.userCancelled) return { success: false, info: null };
    throw e;
  }
}

// ===== Restore — returns detected plan ID or null =====

export async function restorePurchases(): Promise<'monthly' | 'annual' | null> {
  if (!_configured) return null;
  try {
    const info = await Purchases.restorePurchases();
    const pro = info.entitlements.active['pro'];
    if (!pro) return null;
    // Detect plan from product identifier
    const productId = pro.productIdentifier || '';
    if (productId.includes('monthly')) return 'monthly';
    return 'annual'; // default to annual if we can't tell
  } catch (e) {
    __DEV__ && console.warn('RevenueCat: restore failed:', e);
    return null;
  }
}

// ===== Plan ID detection from active entitlement =====

export async function getDetectedPlanId(): Promise<'monthly' | 'annual'> {
  if (!_configured) return 'annual';
  try {
    const info = await Purchases.getCustomerInfo();
    const pro = info.entitlements.active['pro'];
    if (pro?.productIdentifier?.includes('monthly')) return 'monthly';
    return 'annual';
  } catch {
    return 'annual';
  }
}

// ===== Management URL — for "Manage Subscription" button =====

export async function getManagementUrl(): Promise<string | null> {
  if (!_configured) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.managementURL;
  } catch {
    return null;
  }
}
