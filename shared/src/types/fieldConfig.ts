interface BaseFieldDef {
  key: string;
  label: string;
}

export interface EnumFieldDef extends BaseFieldDef {
  type: 'enum';
  options: string[];
  column?: 'gi';
}

export interface BooleanFieldDef extends BaseFieldDef {
  type: 'boolean';
}

export interface NumberFieldDef extends BaseFieldDef {
  type: 'number';
}

export interface TextFieldDef extends BaseFieldDef {
  type: 'text';
}

export interface TextareaFieldDef extends BaseFieldDef {
  type: 'textarea';
}

export type FieldDef =
  | EnumFieldDef
  | BooleanFieldDef
  | NumberFieldDef
  | TextFieldDef
  | TextareaFieldDef;

export type FieldConfig = FieldDef[];
