// Keyword enrichment - adds synonyms, related terms, and hierarchy

/**
 * Enrich keywords with related terms, synonyms, and hierarchy
 */
export function enrichKeywords(
  keywords: string[],
  title: string,
  platform: 'general' | 'adobe' | 'shutterstock'
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
  // NOTE: We intentionally do NOT inject generic "conceptual" keywords (e.g., commercial/marketing)
  // because they reduce precision and can look spammy. Keywords should reflect visible content.
  
  return enriched;
}

/**
 * Add scientific/technical names for animals/plants
 */
export function addScientificNames(keywords: string[]): string[] {
  const scientific: Record<string, string[]> = {
    // Animals - common breeds and species
    'dog': ['canis lupus familiaris', 'canine'],
    'cat': ['felis catus', 'feline'],
    'horse': ['equus caballus', 'equine'],
    'bird': ['aves', 'avian'],
    'apple': ['malus domestica'],
    'rose': ['rosa'],
    'oak': ['quercus'],
    
    // Grass species (common in stock photos)
    'grass': ['poaceae', 'gramineae'],
    'prairie dropseed': ['sporobolus heterolepis'],
    'karl foerster': ['calamagrostis acutiflora'],
    'calamagrostis': ['calamagrostis acutiflora'],
    'sporobolus': ['sporobolus heterolepis'],
    
    // Common plants
    'sunflower': ['helianthus annuus'],
    'tulip': ['tulipa'],
    'daisy': ['bellis perennis'],
    'lavender': ['lavandula'],
    'rosemary': ['rosmarinus officinalis'],
    'basil': ['ocimum basilicum'],
    'tomato': ['solanum lycopersicum'],
    'potato': ['solanum tuberosum'],
    'corn': ['zea mays'],
    'wheat': ['triticum'],
    'rice': ['oryza sativa'],
    
    // Trees
    'pine': ['pinus'],
    'maple': ['acer'],
    'birch': ['betula'],
    'willow': ['salix'],
    'elm': ['ulmus'],
    'cedar': ['cedrus'],
    
    // Common animals
    'cow': ['bos taurus', 'bovine'],
    'sheep': ['ovis aries', 'ovine'],
    'pig': ['sus scrofa domesticus', 'porcine'],
    'chicken': ['gallus gallus domesticus'],
    'duck': ['anatidae'],
    'goose': ['anser'],
    'rabbit': ['oryctolagus cuniculus'],
    'squirrel': ['sciuridae'],
    'deer': ['cervidae'],
    'bear': ['ursidae'],
    'wolf': ['canis lupus'],
    'fox': ['vulpes'],
    'lion': ['panthera leo'],
    'tiger': ['panthera tigris'],
    'elephant': ['elephantidae'],
    
    // Dog breeds (common in stock photos)
    'jack russel terrier': ['canis lupus familiaris'],
    'golden retriever': ['canis lupus familiaris'],
    'labrador': ['canis lupus familiaris'],
    'german shepherd': ['canis lupus familiaris'],
    'bulldog': ['canis lupus familiaris'],
    'poodle': ['canis lupus familiaris'],
    'beagle': ['canis lupus familiaris'],
    'husky': ['canis lupus familiaris'],
    
    // Cat breeds
    'persian': ['felis catus'],
    'siamese': ['felis catus'],
    'maine coon': ['felis catus'],
    'british shorthair': ['felis catus'],
  };
  
  const enriched = [...keywords];
  const existing = new Set(keywords.map(k => k.toLowerCase()));
  
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase().trim();
    const scientificNames = scientific[lower];
    if (scientificNames) {
      for (const scientificName of scientificNames) {
        // Split multi-word scientific names and add each part
        const parts = scientificName.split(/\s+/);
        for (const part of parts) {
          if (part.length > 2 && !existing.has(part)) {
            enriched.push(part);
            existing.add(part);
          }
        }
        // Also add the full scientific name if it's not too long
        if (scientificName.length < 50 && !existing.has(scientificName)) {
          enriched.push(scientificName);
          existing.add(scientificName);
        }
      }
    }
    
    // Also check for partial matches (e.g., "prairie dropseed grass" should match "prairie dropseed")
    for (const [key, names] of Object.entries(scientific)) {
      if (lower.includes(key) || key.includes(lower)) {
        for (const scientificName of names) {
          const parts = scientificName.split(/\s+/);
          for (const part of parts) {
            if (part.length > 2 && !existing.has(part)) {
              enriched.push(part);
              existing.add(part);
            }
          }
        }
      }
    }
  }
  
  return enriched;
}

/**
 * Extract technical keywords from title and add them to keywords if missing
 */
export function extractTechnicalKeywords(keywords: string[], title: string): string[] {
  const enriched = [...keywords];
  const existing = new Set(keywords.map(k => k.toLowerCase()));
  const titleLower = title.toLowerCase();
  
  // Technical attributes to look for
  const technicalTerms: string[] = [
    'high resolution',
    'high-resolution',
    'highres',
    'perfectly cutout',
    'perfectly cut out',
    'cutout',
    'cut out',
    'isolated png',
    'isolated',
    'transparent png',
    'transparent background',
    'png',
    'vector',
    'svg',
    'eps',
    '4k',
    'hd',
    'ultra hd',
    '8k',
    '60fps',
    '30fps',
    'frontal',
    'side view',
    'top view',
    'set of',
    'collection of',
  ];
  
  // Check title for technical terms and add to keywords if not present
  for (const term of technicalTerms) {
    if (titleLower.includes(term.toLowerCase()) && !existing.has(term.toLowerCase())) {
      // Split multi-word terms and add each word
      const words = term.split(/\s+/);
      for (const word of words) {
        if (word.length > 1 && !existing.has(word.toLowerCase())) {
          enriched.push(word);
          existing.add(word.toLowerCase());
        }
      }
      // Also add the full term if it's a meaningful phrase
      if (words.length > 1 && term.length < 30) {
        enriched.push(term);
        existing.add(term.toLowerCase());
      }
    }
  }
  
  return enriched;
}

