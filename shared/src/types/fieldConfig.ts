export type FieldType = 'enum' | 'boolean' | 'number' | 'text' | 'textarea';

interface BaseFieldDef {
  key: string;
  label: string;
  required?: boolean;
}

export interface EnumFieldDef extends BaseFieldDef {
  type: 'enum';
  options: string[];
  column?: string;
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
