import { Injectable } from '@nestjs/common';

const RWANDA_DISTRICTS = [
  'Gasabo',
  'Kicukiro',
  'Nyarugenge',
  'Bugesera',
  'Gatsibo',
  'Kayonza',
  'Kirehe',
  'Ngoma',
  'Nyagatare',
  'Rwamagana',
  'Huye',
  'Kamonyi',
  'Muhanga',
  'Nyamagabe',
  'Nyanza',
  'Nyaruguru',
  'Ruhango',
  'Karongi',
  'Ngororero',
  'Nyabihu',
  'Nyamasheke',
  'Rubavu',
  'Rutsiro',
  'Burera',
  'Gakenke',
  'Gicumbi',
  'Musanze',
  'Rulindo',
];

@Injectable()
export class RegionsService {
  listDistricts() {
    return { districts: RWANDA_DISTRICTS };
  }
}
