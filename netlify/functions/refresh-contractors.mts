import { getStore } from '@netlify/blobs';
import { schedule } from '@netlify/functions';

async function fetchAirtable() {
  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) throw new Error('Missing Airtable credentials');

  async function fetchTable(table: string, params: string) {
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable error on ${table}: ${res.status}`);
    return (await res.json()).records;
  }

  const [contractorRecords, offerRecords] = await Promise.all([
    fetchTable('Contractors', '?filterByFormula={Active}=1'),
    fetchTable('Offers', '?filterByFormula={Active}=1'),
  ]);

  const offerMap: Record<string, { offer: string; financing: string; expires: string }> = {};
  offerRecords.forEach((o: any) => {
    const f = o.fields;
    if (f.Contractor && f.Contractor.length > 0) {
      offerMap[f.Contractor[0]] = {
        offer:     f['Promotional Offer'] || '',
        financing: f['Financing Offer']   || '',
        expires:   f['Expiry Date']        || '',
      };
    }
  });

  const contractors = contractorRecords.map((r: any) => {
    const f   = r.fields;
    const off = offerMap[r.id] || {};
    return {
      id:        r.id,
      initials:  f['Initials']     || '??',
      name:      f['Company Name'] || 'Unknown',
      url:       f['URL']          || '#',
      warranty:  f['Warranty']     || '—',
      locations: f['Locations']    || '—',
      rating:    parseFloat(f['Rating']) || 0,
      featured:  f['Featured']     || false,
      offer:     off.offer,
      financing: off.financing,
      expires:   off.expires,
    };
  });

  contractors.sort((a: any, b: any) => {
    const aExp = a.expires ? new Date(a.expires).getTime() : Infinity;
    const bExp = b.expires ? new Date(b.expires).getTime() : Infinity;
    if (aExp !== bExp) return aExp - bExp;
    return b.rating - a.rating;
  });

  return contractors;
}

export default schedule('0 * * * *', async () => {
  const contractors = await fetchAirtable();
  const store = getStore('contractors');
  await store.setJSON('contractors-cache', contractors);
  console.log(`Refreshed contractors cache: ${contractors.length} records`);
});