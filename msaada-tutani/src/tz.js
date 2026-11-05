// Reference data for Tanzania. The frontend reads this from /api/meta so there is one list.

const REGIONS = [
  'Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma',
  'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza',
  'Njombe', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe',
  'Tabora', 'Tanga',
  // Zanzibar
  'Kaskazini Pemba', 'Kusini Pemba', 'Kaskazini Unguja', 'Kusini Unguja', 'Mjini Magharibi'
];

const LEVELS = {
  health: ['dispensary', 'health_centre', 'district_hospital', 'regional_referral', 'zonal_referral', 'national_hospital'],
  school: ['primary', 'secondary', 'college']
};

const OWNERSHIP = ['government', 'private', 'faith'];

const CATEGORIES = {
  health: ['maternity', 'surgery', 'inpatient', 'child_care', 'emergency', 'dialysis', 'cancer_care', 'other_health'],
  school: ['school_fees', 'exam_fees', 'boarding', 'uniform_books', 'certificate_release', 'other_school']
};

const PAY_VIA = ['gepg', 'bank', 'lipa'];

const ORG_TYPES = ['company', 'ngo', 'religious', 'group', 'other'];

const CHANNELS = ['mpesa', 'mixx', 'airtel', 'halopesa', 'azampesa', 'bank'];

module.exports = { REGIONS, LEVELS, OWNERSHIP, CATEGORIES, PAY_VIA, CHANNELS, ORG_TYPES };
