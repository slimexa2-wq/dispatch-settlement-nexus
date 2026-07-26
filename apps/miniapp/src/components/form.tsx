import { Checkbox, CheckboxGroup, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";
import { localDateString } from "../domain/format";

export function FormField({ label, required, hint, children }: PropsWithChildren<{ label: string; required?: boolean; hint?: string }>) {
  return (
    <View className="form-field">
      <Text className="form-label">{label}{required ? <Text className="form-required"> *</Text> : null}</Text>
      {children}
      {hint ? <Text className="form-hint">{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  value,
  placeholder,
  type = "text",
  onChange,
  maxlength = 120
}: {
  value: string;
  placeholder: string;
  type?: "text" | "number" | "idcard";
  onChange: (value: string) => void;
  maxlength?: number;
}) {
  return <Input className="form-control" value={value} placeholder={placeholder} type={type} maxlength={maxlength} onInput={(event) => onChange(event.detail.value)} />;
}

export function TextAreaField({
  value,
  placeholder,
  onChange,
  maxlength = 2000
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  maxlength?: number;
}) {
  return <Textarea className="form-control form-control--textarea" value={value} placeholder={placeholder} maxlength={maxlength} onInput={(event) => onChange(event.detail.value)} />;
}

export function SelectField({
  value,
  options,
  placeholder,
  onChange
}: {
  value: string;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const selected = options.find((item) => item.value === value);
  return (
    <Picker mode="selector" range={options} rangeKey="label" value={Math.max(0, options.findIndex((item) => item.value === value))} onChange={(event) => {
      const option = options[Number(event.detail.value)];
      if (option) onChange(option.value);
    }}>
      <View className={selected ? "form-control picker-control" : "form-control picker-control picker-control--placeholder"}>{selected?.label ?? placeholder}</View>
    </Picker>
  );
}

export function DateField({ value, onChange, placeholder = "请选择日期" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <Picker mode="date" value={value || localDateString()} onChange={(event) => onChange(String(event.detail.value))}>
      <View className={value ? "form-control picker-control" : "form-control picker-control picker-control--placeholder"}>{value || placeholder}</View>
    </Picker>
  );
}

export function InsuranceField({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const options = [
    { label: "商保", value: "COMMERCIAL" },
    { label: "社保", value: "SOCIAL" },
    { label: "风险金", value: "RISK_FUND" }
  ];
  return (
    <CheckboxGroup className="checkbox-group" onChange={(event) => onChange(event.detail.value)}>
      {options.map((option) => (
        <View className="checkbox-option" key={option.value}>
          <Checkbox value={option.value} checked={value.includes(option.value)} color="#0f766e" />
          <Text>{option.label}</Text>
        </View>
      ))}
    </CheckboxGroup>
  );
}
