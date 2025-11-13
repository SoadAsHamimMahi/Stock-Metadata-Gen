// Keyword enrichment - adds synonyms, related terms, and hierarchy

/**
 * Enrich keywords with related terms, synonyms, and hierarchy
 */
export function enrichKeywords(
  keywords: string[],
  title: string,
  platform: 'adobe' | 'freepik' | 'shutterstock'
): string[] {
  const enriched = [...keywords];
  const existing = new Set(keywords.map(k => k.toLowerCase()));
  
  // Extract words from title for enrichment
  const titleWords = title.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
  
  // Add related terms based on existing keywords
  const relatedTerms: Record<string, string[]> = {
    // Animals
    'dog': ['puppy', 'canine', 'pet', 'companion'],
    'cat': ['kitten', 'feline', 'pet', 'companion'],
    'bird': ['avian', 'feathered', 'flying'],
    'horse': ['equine', 'stallion', 'mare'],
    
    // Colors
    'red': ['crimson', 'scarlet', 'ruby'],
    'blue': ['azure', 'navy', 'cobalt'],
    'green': ['emerald', 'lime', 'forest'],
    'white': ['ivory', 'snow', 'pure'],
    'black': ['ebony', 'charcoal', 'dark'],
    
    // Nature
    'tree': ['forest', 'woodland', 'nature'],
    'flower': ['bloom', 'blossom', 'petal'],
    'mountain': ['peak', 'summit', 'hill'],
    'ocean': ['sea', 'water', 'marine'],
    'beach': ['shore', 'coast', 'seaside'],
    
    // Technology
    'computer': ['pc', 'laptop', 'device'],
    'phone': ['mobile', 'smartphone', 'device'],
    'internet': ['web', 'online', 'digital'],
    
    // People
    'woman': ['female', 'lady', 'person'],
    'man': ['male', 'gentleman', 'person'],
    'child': ['kid', 'youngster', 'youth'],
    
    // Food
    'apple': ['fruit', 'fresh', 'healthy'],
    'bread': ['baked', 'food', 'fresh'],
    'coffee': ['beverage', 'drink', 'hot'],
    
    // Business
    'office': ['workspace', 'business', 'corporate'],
    'meeting': ['conference', 'discussion', 'business'],
    'team': ['group', 'collaboration', 'work'],
  };
  
  // Add related terms
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    const related = relatedTerms[lower];
    if (related) {
      for (const term of related) {
        if (!existing.has(term) && enriched.length < 60) {
          enriched.push(term);
          existing.add(term);
        }
      }
    }
  }
  
  // Add location hierarchy if location keywords exist
  const locationKeywords = ['portland', 'oregon', 'usa', 'new york', 'california', 'texas', 'florida'];
  const hasLocation = keywords.some(k => locationKeywords.some(loc => k.toLowerCase().includes(loc)));
  if (hasLocation) {
    const locationTerms = ['north america', 'united states', 'usa'];
    for (const term of locationTerms) {
      if (!existing.has(term) && enriched.length < 60) {
        enriched.push(term);
        existing.add(term);
      }
    }
  }
  
  // Add general category terms based on keywords
  const categoryMap: Record<string, string[]> = {
    'animal': ['wildlife', 'nature', 'mammal'],
    'person': ['human', 'people', 'individual'],
    'building': ['architecture', 'structure', 'construction'],
    'vehicle': ['transportation', 'automobile', 'car'],
    'food': ['cuisine', 'meal', 'dining'],
    'nature': ['outdoor', 'landscape', 'scenic'],
    'technology': ['digital', 'modern', 'innovation'],
  };
  
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    for (const [category, terms] of Object.entries(categoryMap)) {
      if (lower.includes(category) || category.includes(lower)) {
        for (const term of terms) {
          if (!existing.has(term) && enriched.length < 60) {
            enriched.push(term);
            existing.add(term);
          }
        }
      }
    }
  }
  
  // Platform-specific enrichment
  if (platform === 'adobe') {
    // For Adobe, ensure we have conceptual keywords
    const conceptualTerms = ['commercial', 'business', 'marketing', 'advertising', 'design'];
    for (const term of conceptualTerms) {
      if (!existing.has(term) && enriched.length < 60 && keywords.length > 0) {
        // Only add if we have substantial keywords
        if (keywords.length >= 10) {
          enriched.push(term);
          existing.add(term);
        }
      }
    }
  }
  
  return enriched;
}

/**
 * Add scientific/technical names for animals/plants
 */
export function addScientificNames(keywords: string[]): string[] {
  const scientific: Record<string, string> = {
    'dog': 'canis lupus familiaris',
    'cat': 'felis catus',
    'horse': 'equus caballus',
    'bird': 'aves',
    'apple': 'malus domestica',
    'rose': 'rosa',
    'oak': 'quercus',
  };
  
  const enriched = [...keywords];
  const existing = new Set(keywords.map(k => k.toLowerCase()));
  
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    const scientificName = scientific[lower];
    if (scientificName && !existing.has(scientificName)) {
      enriched.push(scientificName);
      existing.add(scientificName);
    }
  }
  
  return enriched;
}

