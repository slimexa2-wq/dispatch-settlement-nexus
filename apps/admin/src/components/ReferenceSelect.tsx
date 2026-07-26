import type { SelectProps } from "antd";
import { Select } from "antd";

export type ReferenceOption = {
  value: string;
  label: string;
  searchText?: string;
};

type Props = Omit<SelectProps, "options"> & {
  options: ReferenceOption[];
};

export function ReferenceSelect({ options, ...props }: Props) {
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="searchText"
      options={options.map((item) => ({ ...item, searchText: item.searchText ?? item.label }))}
      {...props}
    />
  );
}
