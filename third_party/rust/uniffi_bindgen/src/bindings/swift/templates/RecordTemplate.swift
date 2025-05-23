{%- let rec = ci.get_record_definition(name).unwrap() %}
{%- call swift::docstring(rec, 0) %}
public struct {{ type_name }} {
    {%- for field in rec.fields() %}
    {%- call swift::docstring(field, 4) %}
    public {% if config.generate_immutable_records() %}let{% else %}var{% endif %} {{ field.name()|var_name }}: {{ field|type_name }}
    {%- endfor %}

    // Default memberwise initializers are never public by default, so we
    // declare one manually.
    public init({% call swift::field_list_decl(rec, false) %}) {
        {%- for field in rec.fields() %}
        self.{{ field.name()|var_name }} = {{ field.name()|var_name }}
        {%- endfor %}
    }
}

#if compiler(>=6)
extension {{ type_name }}: Sendable {}
#endif

{% if !contains_object_references %}
extension {{ type_name }}: Equatable, Hashable {
    public static func ==(lhs: {{ type_name }}, rhs: {{ type_name }}) -> Bool {
        {%- for field in rec.fields() %}
        if lhs.{{ field.name()|var_name }} != rhs.{{ field.name()|var_name }} {
            return false
        }
        {%- endfor %}
        return true
    }

    public func hash(into hasher: inout Hasher) {
        {%- for field in rec.fields() %}
        hasher.combine({{ field.name()|var_name }})
        {%- endfor %}
    }
}
{% if config.generate_codable_conformance() %}
extension {{ type_name }}: Codable {}
{% endif %}
{% endif %}

#if swift(>=5.8)
@_documentation(visibility: private)
#endif
public struct {{ ffi_converter_name }}: FfiConverterRustBuffer {
    public static func read(from buf: inout (data: Data, offset: Data.Index)) throws -> {{ type_name }} {
        return {%- if rec.has_fields() %}
            try {{ type_name }}(
            {%- for field in rec.fields() %}
                {{ field.name()|arg_name }}: {{ field|read_fn }}(from: &buf)
                {%- if !loop.last %}, {% endif %}
            {%- endfor %}
        )
        {%- else %}
            {{ type_name }}()
        {%- endif %}
    }

    public static func write(_ value: {{ type_name }}, into buf: inout [UInt8]) {
        {%- for field in rec.fields() %}
        {{ field|write_fn }}(value.{{ field.name()|var_name }}, into: &buf)
        {%- endfor %}
    }
}

{#
We always write these public functions just in case the struct is used as
an external type by another crate.
#}
#if swift(>=5.8)
@_documentation(visibility: private)
#endif
public func {{ ffi_converter_name }}_lift(_ buf: RustBuffer) throws -> {{ type_name }} {
    return try {{ ffi_converter_name }}.lift(buf)
}

#if swift(>=5.8)
@_documentation(visibility: private)
#endif
public func {{ ffi_converter_name }}_lower(_ value: {{ type_name }}) -> RustBuffer {
    return {{ ffi_converter_name }}.lower(value)
}
