// Country flag for each city in WORLD_CITIES, used by the admin "Ciudades"
// view to show a little flag to the right of each name. Keyed by the EXACT
// Spanish city string used in cities.ts (accents/apostrophe included). We store
// the ISO 3166-1 alpha-2 code and derive the flag emoji at runtime.
const CITY_COUNTRY: Record<string, string> = {
  Tokio: 'JP',
  Delhi: 'IN',
  Shanghái: 'CN',
  Daca: 'BD',
  'São Paulo': 'BR',
  'Ciudad de México': 'MX',
  'El Cairo': 'EG',
  Pekín: 'CN',
  Bombay: 'IN',
  Osaka: 'JP',
  Karachi: 'PK',
  Chongqing: 'CN',
  Estambul: 'TR',
  'Buenos Aires': 'AR',
  Calcuta: 'IN',
  Lagos: 'NG',
  Kinsasa: 'CD',
  Manila: 'PH',
  Tianjin: 'CN',
  Cantón: 'CN',
  'Río de Janeiro': 'BR',
  Lahore: 'PK',
  Bangalore: 'IN',
  Shenzhen: 'CN',
  Moscú: 'RU',
  Chennai: 'IN',
  Bogotá: 'CO',
  Yakarta: 'ID',
  Lima: 'PE',
  París: 'FR',
  Bangkok: 'TH',
  Hyderabad: 'IN',
  Seúl: 'KR',
  Nankín: 'CN',
  Chengdú: 'CN',
  Londres: 'GB',
  Luanda: 'AO',
  Teherán: 'IR',
  'Ho Chi Minh': 'VN',
  Nagoya: 'JP',
  "Xi'an": 'CN',
  Ahmedabad: 'IN',
  Wuhan: 'CN',
  'Kuala Lumpur': 'MY',
  Hangzhou: 'CN',
  Suzhou: 'CN',
  Surat: 'IN',
  'Dar es-Salam': 'TZ',
  'Nueva York': 'US',
  Bagdad: 'IQ',
  Shenyang: 'CN',
  Riad: 'SA',
  'Hong Kong': 'HK',
  Foshan: 'CN',
  Dongguan: 'CN',
  Pune: 'IN',
  Santiago: 'CL',
  Madrid: 'ES',
  Harbin: 'CN',
  Toronto: 'CA',
  Johannesburgo: 'ZA',
  'Belo Horizonte': 'BR',
  Jartum: 'SD',
  Qingdao: 'CN',
  Dalian: 'CN',
  Singapur: 'SG',
  Chittagong: 'BD',
  Abiyán: 'CI',
  Barcelona: 'ES',
  Ankara: 'TR',
  Rangún: 'MM',
  Alejandría: 'EG',
  Jinan: 'CN',
  Guadalajara: 'MX',
  Kabul: 'AF',
  Zhengzhou: 'CN',
  Berlín: 'DE',
  'Adís Abeba': 'ET',
  Nairobi: 'KE',
  Casablanca: 'MA',
  'Ciudad del Cabo': 'ZA',
  Yeda: 'SA',
  Changsha: 'CN',
  Kanpur: 'IN',
  Xiamen: 'CN',
  Kunming: 'CN',
  'Tel Aviv': 'IL',
  Roma: 'IT',
  'Los Ángeles': 'US',
  Medellín: 'CO',
  Nanchang: 'CN',
  Faisalabad: 'PK',
  Wenzhou: 'CN',
  Hefei: 'CN',
  Fukuoka: 'JP',
  Monterrey: 'MX',
  Recife: 'BR',
  'Porto Alegre': 'BR',
  Salvador: 'BR',
  Sídney: 'AU',
};

// Turn an ISO2 code (e.g. "MX") into its flag emoji by mapping each letter to
// its Regional Indicator Symbol (A → 🇦, …); the pair renders as one flag.
function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

// Flag emoji for a city, or '' if we don't have a country mapping for it.
export function cityFlag(city: string): string {
  const iso = CITY_COUNTRY[city];
  return iso ? flagEmoji(iso) : '';
}

// ISO2 code for a city (handy as a fallback text label), or '' if unmapped.
export function cityCountryCode(city: string): string {
  return CITY_COUNTRY[city] ?? '';
}
