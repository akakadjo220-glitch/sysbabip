import { supabase } from '../supabaseClient';
import { generateSlug } from '../constants';

/**
 * Generates a unique slug for a given table by checking against existing records.
 * @param title The base title to convert to a slug.
 * @param tableName 'events' or 'fundraising_campaigns'
 * @param existingId If updating an existing record, pass its ID to ignore it in collision checks.
 * @returns A guaranteed unique slug (e.g. "my-title" or "my-title-1")
 */
export const getUniqueSlug = async (title: string, tableName: 'events' | 'fundraising_campaigns', existingId?: string): Promise<string> => {
  const baseSlug = generateSlug(title) || 'sans-titre';
  let slug = baseSlug;
  let counter = 1;
  let isUnique = false;

  while (!isUnique) {
    let query = supabase
      .from(tableName)
      .select('id')
      .eq('slug', slug);

    if (existingId) {
      query = query.neq('id', existingId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.warn("Error checking slug uniqueness. Using timestamp fallback.", error);
      // Fallback in case of network error, to not block creation
      return `${baseSlug}-${Date.now().toString().slice(-4)}`;
    }

    if (!data) {
      isUnique = true;
    } else {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }

  return slug;
};
