// utils/countryCodes.ts

interface CountryData {
  name: {
    common: string;
    official: string;
    nativeName?: any;
  };
  cca2: string; // ex: CI, FR, SN
  idd: {
    root?: string;
    suffixes?: string[];
  };
}

const FALLBACK_DIAL_CODES: Record<string, string> = {
  'ci': '+225',
  'côte d\'ivoire': '+225',
  'cote d\'ivoire': '+225',
  'ivory coast': '+225',
  'sn': '+221',
  'sénégal': '+221',
  'senegal': '+221',
  'fr': '+33',
  'france': '+33',
  'cm': '+237',
  'cameroun': '+237',
  'cameron': '+237',
  'bf': '+226',
  'burkina faso': '+226',
  'ml': '+223',
  'mali': '+223',
  'tg': '+228',
  'togo': '+228',
  'bj': '+229',
  'bénin': '+229',
  'benin': '+229',
  'ga': '+241',
  'gabon': '+241',
  'gn': '+224',
  'guinée': '+224',
  'guinea': '+224',
  'cg': '+242',
  'congo': '+242',
  'cd': '+243',
  'rd congo': '+243',
  'republique democratique du congo': '+243',
  'ne': '+227',
  'niger': '+227',
  'td': '+235',
  'tchad': '+235',
  'ma': '+212',
  'maroc': '+212',
  'morocco': '+212',
  'tn': '+216',
  'tunisie': '+216',
  'dz': '+213',
  'algérie': '+213',
  'algeria': '+213',
  'be': '+32',
  'belgique': '+32',
  'belgium': '+32',
  'ch': '+41',
  'suisse': '+41',
  'switzerland': '+41',
  'ca': '+1',
  'canada': '+1',
  'us': '+1',
  'usa': '+1',
  'états-unis': '+1',
  'united states': '+1'
};

/**
 * Algo de récupération dynamique des indicatifs téléphoniques du monde entier.
 * Permet d'anticiper la création future de nouveaux pays sur la plateforme.
 * Utilise l'API publique RestCountries et met en cache dans le localStorage.
 */
export const getCountryDialCode = async (countryNameOrCode: string): Promise<string> => {
  // Normalisation de la clé de recherche
  const searchKey = countryNameOrCode.toLowerCase().trim();

  // 1. Vérification du cache local
  const cachedData = localStorage.getItem('afriTix_country_dial_codes');
  let dialCodesMap: Record<string, string> = cachedData ? JSON.parse(cachedData) : {};

  if (dialCodesMap[searchKey]) {
    return dialCodesMap[searchKey];
  }

  // 2. Vérification des fallbacks statiques avant l'API externe (évite les requêtes inutiles et les soucis de CORS)
  if (FALLBACK_DIAL_CODES[searchKey]) {
    return FALLBACK_DIAL_CODES[searchKey];
  }

  // 3. Si pas en cache ni en fallback, on cherche via API externe
  try {
    const response = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,idd');
    if (!response.ok) throw new Error("Erreur réseau API RestCountries");
    
    const countries: CountryData[] = await response.json();
    
    // On construit une nouvelle Map mémoire
    const newMap: Record<string, string> = { ...FALLBACK_DIAL_CODES };
    
    countries.forEach(c => {
      // Calcul de l'indicatif (root + 1er suffixe)
      const root = c.idd?.root || '';
      const suffix = c.idd?.suffixes?.[0] || '';
      const dialCode = `${root}${suffix}`;
      
      if (dialCode) {
        // Enregistrer avec la clé Nom Francais/Anglais/Commun
        if (c.name.common) newMap[c.name.common.toLowerCase()] = dialCode;
        if (c.name.official) newMap[c.name.official.toLowerCase()] = dialCode;
        // Enregistrer aussi avec le code Iso2 (ex: CI, SN, FR)
        newMap[c.cca2.toLowerCase()] = dialCode;
      }
    });

    // 4. Sauvegarder dans le Cache
    localStorage.setItem('afriTix_country_dial_codes', JSON.stringify(newMap));

    // Retourner la valeur trouvée ou un fallback si toujours introuvable
    return newMap[searchKey] || FALLBACK_DIAL_CODES[searchKey] || '';
  } catch (error) {
    console.warn("Impossible de récupérer les indicatifs dynamiques de restcountries.com due to CORS/network block, using static fallback.");
    return FALLBACK_DIAL_CODES[searchKey] || '';
  }
};
