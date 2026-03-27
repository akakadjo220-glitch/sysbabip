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

/**
 * Algo de récupération dynamique des indicatifs téléphoniques du monde entier.
 * Permet d'anticiper la création future de nouveaux pays sur la plateforme.
 * Utilise l'API publique RestCountries et met en cache dans le localStorage.
 */
export const getCountryDialCode = async (countryNameOrCode: string): Promise<string> => {
  // 1. Vérification du cache local
  const cachedData = localStorage.getItem('afriTix_country_dial_codes');
  let dialCodesMap: Record<string, string> = cachedData ? JSON.parse(cachedData) : {};

  // Normalisation de la clé de recherche
  const searchKey = countryNameOrCode.toLowerCase().trim();

  if (dialCodesMap[searchKey]) {
    return dialCodesMap[searchKey];
  }

  // 2. Si pas en cache, on lance le "script/algo" demandé pour chercher via API externe
  try {
    const response = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,idd');
    if (!response.ok) throw new Error("Erreur réseau API RestCountries");
    
    const countries: CountryData[] = await response.json();
    
    // On construit une nouvelle Map mémoire
    const newMap: Record<string, string> = {};
    
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

    // Mapping spécifique pour la Côte d'Ivoire qui a souvent des soucis d'encodage ('cote d'ivoire', etc)
    newMap['côte d\'ivoire'] = '+225';
    newMap['cote d\'ivoire'] = '+225';
    newMap['ivory coast'] = '+225';

    // 3. Sauvegarder dans le Cache
    localStorage.setItem('afriTix_country_dial_codes', JSON.stringify(newMap));

    // Retourner la valeur trouvée ou un fallback si toujours introuvable
    return newMap[searchKey] || '';
  } catch (error) {
    console.error("Impossible de récupérer les indicatifs dynamiques:", error);
    return '';
  }
};
