import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AddressFieldsValue {
  city: string;
  street: string;
  house: string;
  building: string;
  floor: string;
  apartment: string;
  cadastralNumber: string;
}

export const EMPTY_ADDRESS_FIELDS: AddressFieldsValue = {
  city: '',
  street: '',
  house: '',
  building: '',
  floor: '',
  apartment: '',
  cadastralNumber: '',
};

export function AddressFields({
  value,
  onChange,
  idPrefix,
  legacyAddress,
}: {
  value: AddressFieldsValue;
  onChange: (value: AddressFieldsValue) => void;
  idPrefix: string;
  legacyAddress?: string | null;
}) {
  const setField = (field: keyof AddressFieldsValue, fieldValue: string) =>
    onChange({ ...value, [field]: fieldValue });

  return (
    <div className="space-y-4">
      {legacyAddress && (
        <p className="rounded-md border border-warn-line bg-warn-weak px-4 py-3 text-sm text-content-secondary">
          Раньше адрес был записан одной строкой: «{legacyAddress}». Перенесите её в
          поля — в документах она останется, пока поля не заполнены.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-city`}>Город</Label>
        <Input
          id={`${idPrefix}-city`}
          value={value.city}
          onChange={(e) => setField('city', e.target.value)}
          maxLength={120}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-street`}>Улица</Label>
        <Input
          id={`${idPrefix}-street`}
          value={value.street}
          onChange={(e) => setField('street', e.target.value)}
          maxLength={120}
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-house`}>Дом</Label>
          <Input
            id={`${idPrefix}-house`}
            value={value.house}
            onChange={(e) => setField('house', e.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-building`}>Строение</Label>
          <Input
            id={`${idPrefix}-building`}
            value={value.building}
            onChange={(e) => setField('building', e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-floor`}>Этаж</Label>
          <Input
            id={`${idPrefix}-floor`}
            value={value.floor}
            onChange={(e) => setField('floor', e.target.value)}
            maxLength={60}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-apartment`}>Квартира</Label>
        <Input
          id={`${idPrefix}-apartment`}
          value={value.apartment}
          onChange={(e) => setField('apartment', e.target.value)}
          maxLength={60}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-cadastral`}>Кадастровый номер</Label>
        <Input
          id={`${idPrefix}-cadastral`}
          value={value.cadastralNumber}
          onChange={(e) => setField('cadastralNumber', e.target.value)}
          placeholder="38:36:000021:1234"
        />
        <p className="text-sm text-content-muted">
          Четыре числа через двоеточие, например 38:36:000021:1234.
        </p>
      </div>
    </div>
  );
}
