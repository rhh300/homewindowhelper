exports.handler = async function () {
  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing Airtable credentials' }),
    };
  }

  async function fetchTable(table, params) {
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${params || ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable error on ${table}: ${res.status}`);
    return (await res.json()).records;
  }

  try {
    const [contractorRecords, offerRecords] = await Promise.all([
      fetchTable('Contractors', '?filterByFormula={Active}=1'),
      fetchTable('Offers', '?filterByFormula={Active}=1'),
    ]);

    // Map offers by contractor record ID
    const offerMap = {};
    offerRecords.forEach(o => {
      const f = o.fields;
      if (f.Contractor && f.Contractor.length > 0) {
        offerMap[f.Contractor[0]] = {
          offer:     f['Promotional Offer'] || '',
          financing: f['Financing Offer']   || '',
          expires:   f['Expiry Date']        || '',
        };
      }
    });

    // Merge contractor + offer data
    const contractors = contractorRecords.map(r => {
      const f   = r.fields;
      const off = offerMap[r.id] || {};
      return {
        id:       r.id,
        initials: f['Initials']      || '??',
        name:     f['Company Name']  || 'Unknown',
        url:      f['URL']           || '#',
        warranty:  f['Warranty'] || '—',
        locations: f['Locations']        || '—',
        rating:   parseFloat(f['Google Rating']) || 0,
        featured: f['Featured']      || false,
        offer:    off.offer,
        financing:off.financing,
        expires:  off.expires,
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contractors),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
