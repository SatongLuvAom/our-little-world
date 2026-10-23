"use client";
import { useId } from "react";
import {
  useForm,
  type Resolver,
  type FieldValues,
  type DefaultValues,
  type Path,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { Field } from "./shared";
import { Button } from "./ui/button";

export default function EditorForm<T extends FieldValues>({
  schema,
  values,
  fields,
  onSave,
}: {
  schema: z.ZodType<T>;
  values: DefaultValues<T>;
  fields: Field[];
  onSave: (data: T) => void | Promise<void>;
}) {
  const uid = useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<T>({
    resolver: zodResolver(schema as never) as Resolver<T>,
    defaultValues: values,
  });
  return (
    <form onSubmit={handleSubmit(onSave)} className="editor-form" noValidate>
      {fields.map((field) => {
        const error = errors[field.name];
        const props = {
          ...register(field.name as Path<T>, {
            valueAsNumber: field.type === "number",
          }),
          id: `${uid}-${field.name}`,
          "aria-invalid": !!error,
          "aria-describedby": error ? `${uid}-${field.name}-error` : undefined,
        };
        return (
          <div className="form-field" key={field.name}>
            <label htmlFor={props.id}>{field.label}</label>
            {field.type === "textarea" ? (
              <textarea {...props} rows={4} maxLength={5000} />
            ) : field.type === "select" ? (
              <select {...props}>
                {field.options?.map((o) => (
                  <option
                    key={typeof o === "string" ? o : o.value}
                    value={typeof o === "string" ? o : o.value}
                  >
                    {typeof o === "string" ? o : o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...props}
                type={field.type || "text"}
                min={field.min}
                max={field.max}
                step={field.step}
                maxLength={
                  field.type === "text" || !field.type ? 120 : undefined
                }
              />
            )}
            {error && (
              <p className="field-error" id={`${uid}-${field.name}-error`}>
                {String(error.message)}
              </p>
            )}
          </div>
        );
      })}
      <Button type="submit" disabled={isSubmitting} className="full-width">
        บันทึก
      </Button>
    </form>
  );
}
