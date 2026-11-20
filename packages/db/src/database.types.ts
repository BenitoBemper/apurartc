
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "api_chaves": {
                  Row: {
                    "criado_em": string,"criado_por": string | null,"empresa_id": string | null,"escopos": (string)[],"escritorio_id": string,"hash_chave": string,"id": string,"nome": string,"prefixo": string,"revogada_em": string | null,"ultimo_uso": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"criado_por"?: string | null,"empresa_id"?: string | null,"escopos"?: (string)[],"escritorio_id": string,"hash_chave": string,"id"?: string,"nome": string,"prefixo": string,"revogada_em"?: string | null,"ultimo_uso"?: string | null
                  }
                  Update: {
                    "criado_em"?: string,"criado_por"?: string | null,"empresa_id"?: string | null,"escopos"?: (string)[],"escritorio_id"?: string,"hash_chave"?: string,"id"?: string,"nome"?: string,"prefixo"?: string,"revogada_em"?: string | null,"ultimo_uso"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_chaves_empresa_id_escritorio_id_fkey"
      columns: ["empresa_id","escritorio_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id","escritorio_id"]
    },{
      foreignKeyName: "api_chaves_escritorio_id_fkey"
      columns: ["escritorio_id"]
isOneToOne: false
      referencedRelation: "escritorios"
      referencedColumns: ["id"]
    }
                  ]
                },"auditoria": {
                  Row: {
                    "acao": string,"criado_em": string,"detalhes": Json | null,"entidade": string,"entidade_id": string | null,"escritorio_id": string | null,"id": number,"ip": unknown,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"criado_em"?: string,"detalhes"?: Json | null,"entidade": string,"entidade_id"?: string | null,"escritorio_id"?: string | null,"id"?: never,"ip"?: unknown,"user_id"?: string | null
                  }
                  Update: {
                    "acao"?: string,"criado_em"?: string,"detalhes"?: Json | null,"entidade"?: string,"entidade_id"?: string | null,"escritorio_id"?: string | null,"id"?: never,"ip"?: unknown,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "auditoria_escritorio_id_fkey"
      columns: ["escritorio_id"]
isOneToOne: false
      referencedRelation: "escritorios"
      referencedColumns: ["id"]
    }
                  ]
                },"documentos": {
                  Row: {
                    "chave_acesso": string | null,"competencia": string | null,"criado_em": string,"dh_emissao": string,"dh_fato_gerador": string | null,"empresa_id": string,"escritorio_id": string,"id": string,"importacao_id": string,"municipio": number | null,"numero": string | null,"serie": string | null,"status": string,"tipo_dfe": string,"uf": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chave_acesso"?: string | null,"competencia"?: never,"criado_em"?: string,"dh_emissao": string,"dh_fato_gerador"?: string | null,"empresa_id": string,"escritorio_id": string,"id"?: string,"importacao_id": string,"municipio"?: number | null,"numero"?: string | null,"serie"?: string | null,"status"?: string,"tipo_dfe": string,"uf"?: string | null
                  }
                  Update: {
                    "chave_acesso"?: string | null,"competencia"?: never,"criado_em"?: string,"dh_emissao"?: string,"dh_fato_gerador"?: string | null,"empresa_id"?: string,"escritorio_id"?: string,"id"?: string,"importacao_id"?: string,"municipio"?: number | null,"numero"?: string | null,"serie"?: string | null,"status"?: string,"tipo_dfe"?: string,"uf"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documentos_importacao_id_escritorio_id_empresa_id_fkey"
      columns: ["importacao_id","escritorio_id","empresa_id"]
isOneToOne: false
      referencedRelation: "importacoes"
      referencedColumns: ["id","escritorio_id","empresa_id"]
    }
                  ]
                },"empresas": {
                  Row: {
                    "ativo": boolean,"cnpj": string,"cnpj_base": string | null,"criado_em": string,"escritorio_id": string,"id": string,"municipio_ibge": number | null,"razao_social": string,"uf": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"cnpj": string,"cnpj_base"?: never,"criado_em"?: string,"escritorio_id": string,"id"?: string,"municipio_ibge"?: number | null,"razao_social": string,"uf"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"cnpj"?: string,"cnpj_base"?: never,"criado_em"?: string,"escritorio_id"?: string,"id"?: string,"municipio_ibge"?: number | null,"razao_social"?: string,"uf"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "empresas_escritorio_id_fkey"
      columns: ["escritorio_id"]
isOneToOne: false
      referencedRelation: "escritorios"
      referencedColumns: ["id"]
    }
                  ]
                },"erros_validacao": {
                  Row: {
                    "campo": string | null,"codigo": string,"criado_em": string,"documento_id": string | null,"empresa_id": string,"escritorio_id": string,"id": string,"importacao_id": string,"item_numero": number | null,"mensagem": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campo"?: string | null,"codigo": string,"criado_em"?: string,"documento_id"?: string | null,"empresa_id": string,"escritorio_id": string,"id"?: string,"importacao_id": string,"item_numero"?: number | null,"mensagem": string
                  }
                  Update: {
                    "campo"?: string | null,"codigo"?: string,"criado_em"?: string,"documento_id"?: string | null,"empresa_id"?: string,"escritorio_id"?: string,"id"?: string,"importacao_id"?: string,"item_numero"?: number | null,"mensagem"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "erros_validacao_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "documentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "erros_validacao_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "vw_divergencias"
      referencedColumns: ["documento_id"]
    },{
      foreignKeyName: "erros_validacao_importacao_id_escritorio_id_empresa_id_fkey"
      columns: ["importacao_id","escritorio_id","empresa_id"]
isOneToOne: false
      referencedRelation: "importacoes"
      referencedColumns: ["id","escritorio_id","empresa_id"]
    }
                  ]
                },"escritorios": {
                  Row: {
                    "criado_em": string,"documento": string | null,"id": string,"nome": string,"plano": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"documento"?: string | null,"id"?: string,"nome": string,"plano"?: string
                  }
                  Update: {
                    "criado_em"?: string,"documento"?: string | null,"id"?: string,"nome"?: string,"plano"?: string
                  }
                  Relationships: [
                    
                  ]
                },"importacoes": {
                  Row: {
                    "arquivo_path": string,"concluido_em": string | null,"criado_em": string,"criado_por": string | null,"empresa_id": string,"escritorio_id": string,"formato": Database["public"]['Enums']["formato_importacao"],"hash_sha256": string,"id": string,"mensagem_erro": string | null,"origem": Database["public"]['Enums']["origem_importacao"],"qtd_docs": number,"qtd_erros": number,"status": Database["public"]['Enums']["status_importacao"]
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivo_path": string,"concluido_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"empresa_id": string,"escritorio_id": string,"formato": Database["public"]['Enums']["formato_importacao"],"hash_sha256": string,"id"?: string,"mensagem_erro"?: string | null,"origem"?: Database["public"]['Enums']["origem_importacao"],"qtd_docs"?: number,"qtd_erros"?: number,"status"?: Database["public"]['Enums']["status_importacao"]
                  }
                  Update: {
                    "arquivo_path"?: string,"concluido_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"empresa_id"?: string,"escritorio_id"?: string,"formato"?: Database["public"]['Enums']["formato_importacao"],"hash_sha256"?: string,"id"?: string,"mensagem_erro"?: string | null,"origem"?: Database["public"]['Enums']["origem_importacao"],"qtd_docs"?: number,"qtd_erros"?: number,"status"?: Database["public"]['Enums']["status_importacao"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "importacoes_empresa_id_escritorio_id_fkey"
      columns: ["empresa_id","escritorio_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id","escritorio_id"]
    }
                  ]
                },"itens": {
                  Row: {
                    "base_calculo": number | null,"cbs_informado": number | null,"cclasstrib": string | null,"competencia": string,"criado_em": string,"cst": string | null,"documento_id": string,"empresa_id": string,"escritorio_id": string,"ibs_mun_informado": number | null,"ibs_uf_informado": number | null,"id": string,"is_informado": number | null,"nbs": string | null,"ncm": string | null,"numero": number,"quantidade": number | null,"unidade": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "base_calculo"?: number | null,"cbs_informado"?: number | null,"cclasstrib"?: string | null,"competencia": string,"criado_em"?: string,"cst"?: string | null,"documento_id": string,"empresa_id": string,"escritorio_id": string,"ibs_mun_informado"?: number | null,"ibs_uf_informado"?: number | null,"id"?: string,"is_informado"?: number | null,"nbs"?: string | null,"ncm"?: string | null,"numero": number,"quantidade"?: number | null,"unidade"?: string | null
                  }
                  Update: {
                    "base_calculo"?: number | null,"cbs_informado"?: number | null,"cclasstrib"?: string | null,"competencia"?: string,"criado_em"?: string,"cst"?: string | null,"documento_id"?: string,"empresa_id"?: string,"escritorio_id"?: string,"ibs_mun_informado"?: number | null,"ibs_uf_informado"?: number | null,"id"?: string,"is_informado"?: number | null,"nbs"?: string | null,"ncm"?: string | null,"numero"?: number,"quantidade"?: number | null,"unidade"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "itens_documento_id_escritorio_id_empresa_id_competencia_fkey"
      columns: ["documento_id","escritorio_id","empresa_id","competencia"]
isOneToOne: false
      referencedRelation: "documentos"
      referencedColumns: ["id","escritorio_id","empresa_id","competencia"]
    }
                  ]
                },"membros": {
                  Row: {
                    "criado_em": string,"escritorio_id": string,"id": string,"papel": Database["public"]['Enums']["papel_membro"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"escritorio_id": string,"id"?: string,"papel"?: Database["public"]['Enums']["papel_membro"],"user_id": string
                  }
                  Update: {
                    "criado_em"?: string,"escritorio_id"?: string,"id"?: string,"papel"?: Database["public"]['Enums']["papel_membro"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membros_escritorio_id_fkey"
      columns: ["escritorio_id"]
isOneToOne: false
      referencedRelation: "escritorios"
      referencedColumns: ["id"]
    }
                  ]
                },"membros_empresas": {
                  Row: {
                    "criado_em": string,"empresa_id": string,"escritorio_id": string,"membro_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"empresa_id": string,"escritorio_id": string,"membro_id": string
                  }
                  Update: {
                    "criado_em"?: string,"empresa_id"?: string,"escritorio_id"?: string,"membro_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membros_empresas_empresa_id_escritorio_id_fkey"
      columns: ["empresa_id","escritorio_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id","escritorio_id"]
    },{
      foreignKeyName: "membros_empresas_membro_id_escritorio_id_fkey"
      columns: ["membro_id","escritorio_id"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["id","escritorio_id"]
    }
                  ]
                },"resultados_calculo": {
                  Row: {
                    "cbs_aliquota": number | null,"cbs_valor": number | null,"competencia": string,"criado_em": string,"empresa_id": string,"escritorio_id": string,"estado_item": Database["public"]['Enums']["estado_item"],"ibs_mun_aliquota": number | null,"ibs_mun_valor": number | null,"ibs_uf_aliquota": number | null,"ibs_uf_valor": number | null,"id": string,"is_aliquota": number | null,"is_valor": number | null,"item_id": string,"roc_path": string | null,"versao_base": string,"versao_calculadora": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cbs_aliquota"?: number | null,"cbs_valor"?: number | null,"competencia": string,"criado_em"?: string,"empresa_id": string,"escritorio_id": string,"estado_item": Database["public"]['Enums']["estado_item"],"ibs_mun_aliquota"?: number | null,"ibs_mun_valor"?: number | null,"ibs_uf_aliquota"?: number | null,"ibs_uf_valor"?: number | null,"id"?: string,"is_aliquota"?: number | null,"is_valor"?: number | null,"item_id": string,"roc_path"?: string | null,"versao_base": string,"versao_calculadora": string
                  }
                  Update: {
                    "cbs_aliquota"?: number | null,"cbs_valor"?: number | null,"competencia"?: string,"criado_em"?: string,"empresa_id"?: string,"escritorio_id"?: string,"estado_item"?: Database["public"]['Enums']["estado_item"],"ibs_mun_aliquota"?: number | null,"ibs_mun_valor"?: number | null,"ibs_uf_aliquota"?: number | null,"ibs_uf_valor"?: number | null,"id"?: string,"is_aliquota"?: number | null,"is_valor"?: number | null,"item_id"?: string,"roc_path"?: string | null,"versao_base"?: string,"versao_calculadora"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resultados_calculo_item_id_competencia_fkey"
      columns: ["item_id","competencia"]
isOneToOne: false
      referencedRelation: "itens"
      referencedColumns: ["id","competencia"]
    },{
      foreignKeyName: "resultados_calculo_item_id_competencia_fkey"
      columns: ["item_id","competencia"]
isOneToOne: false
      referencedRelation: "vw_divergencias"
      referencedColumns: ["item_id","competencia"]
    }
                  ]
                },"uso_mensal": {
                  Row: {
                    "atualizado_em": string,"competencia": string,"escritorio_id": string,"qtd_cnpjs": number,"qtd_notas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"competencia": string,"escritorio_id": string,"qtd_cnpjs"?: number,"qtd_notas"?: number
                  }
                  Update: {
                    "atualizado_em"?: string,"competencia"?: string,"escritorio_id"?: string,"qtd_cnpjs"?: number,"qtd_notas"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "uso_mensal_escritorio_id_fkey"
      columns: ["escritorio_id"]
isOneToOne: false
      referencedRelation: "escritorios"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "vw_divergencias": {
                  Row: {
                    "calculado": number | null,"chave_acesso": string | null,"competencia": string,"diferenca": number | null,"documento_id": string,"empresa_id": string,"escritorio_id": string,"estado_item": Database["public"]['Enums']["estado_item"],"informado": number | null,"item_id": string,"item_numero": number,"tributo": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"vw_totais_mensais": {
                  Row: {
                    "cbs_total": number | null,"competencia": string,"empresa_id": string,"escritorio_id": string,"ibs_mun_total": number | null,"ibs_uf_total": number | null,"is_total": number | null,"qtd_calculados": number | null,"qtd_itens": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "criar_escritorio":
{ Args: { "p_documento"?: string,"p_nome": string }; Returns: string
                           }
          }
          Enums: {
            "estado_item": "CALCULADO"|"CALCULO_SIMULADO"|"INCONSISTENCIA_ENTRADA"|"NAO_IMPLEMENTADO"|"FALHA_TECNICA","formato_importacao": "json"|"xml_nfe"|"xml_nfse"|"txt","origem_importacao": "upload"|"api","papel_membro": "admin"|"operador"|"leitor","status_importacao": "recebido"|"validando"|"processando"|"concluido"|"erro"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "estado_item": ["CALCULADO", "CALCULO_SIMULADO", "INCONSISTENCIA_ENTRADA", "NAO_IMPLEMENTADO", "FALHA_TECNICA"],"formato_importacao": ["json", "xml_nfe", "xml_nfse", "txt"],"origem_importacao": ["upload", "api"],"papel_membro": ["admin", "operador", "leitor"],"status_importacao": ["recebido", "validando", "processando", "concluido", "erro"]
          }
        }
} as const
