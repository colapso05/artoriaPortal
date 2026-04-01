import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, company_id } = body;

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is global admin OR company admin
    const { data: globalRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin");
    const isGlobalAdmin = globalRole && globalRole.length > 0;

    if (!isGlobalAdmin) {
      const { data: companyMembership } = await supabaseAdmin
        .from("company_users")
        .select("role")
        .eq("user_id", caller.id)
        .eq("company_id", company_id)
        .eq("role", "administrador")
        .single();

      if (!companyMembership) {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    switch (action) {
      case "create": {
        const { email, display_name, password, role } = body;
        
        // Create auth user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: password || "TempPass123!",
          email_confirm: true,
          user_metadata: { display_name },
        });

        if (createError) {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const userId = newUser.user!.id;

        // Assign basic user role
        await supabaseAdmin.from("user_roles").insert({
          user_id: userId,
          role: "user",
        });

        // Add to company with specified role
        await supabaseAdmin.from("company_users").insert({
          company_id,
          user_id: userId,
          role: role || "operador",
        });

        // Update profile
        await supabaseAdmin
          .from("profiles")
          .update({ must_change_password: true, display_name })
          .eq("user_id", userId);

        return new Response(
          JSON.stringify({ success: true, user: { id: userId, email } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update": {
        const { user_id, email, display_name, password, role } = body;

        if (!user_id) {
          return new Response(JSON.stringify({ error: "user_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify user belongs to company
        const { data: membership } = await supabaseAdmin
          .from("company_users")
          .select("id")
          .eq("user_id", user_id)
          .eq("company_id", company_id)
          .single();

        if (!membership) {
          return new Response(JSON.stringify({ error: "User not in company" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update auth
        const authUpdate: Record<string, any> = {};
        if (email) authUpdate.email = email;
        if (password) authUpdate.password = password;

        if (Object.keys(authUpdate).length > 0) {
          const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, authUpdate);
          if (authError) {
            return new Response(JSON.stringify({ error: authError.message }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Update profile
        const profileUpdate: Record<string, any> = {};
        if (display_name !== undefined) profileUpdate.display_name = display_name;
        if (email) profileUpdate.email = email;
        if (password) profileUpdate.must_change_password = true;

        if (Object.keys(profileUpdate).length > 0) {
          await supabaseAdmin.from("profiles").update(profileUpdate).eq("user_id", user_id);
        }

        // Update company role
        if (role) {
          await supabaseAdmin
            .from("company_users")
            .update({ role })
            .eq("user_id", user_id)
            .eq("company_id", company_id);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        const { user_id } = body;

        if (!user_id) {
          return new Response(JSON.stringify({ error: "user_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (user_id === caller.id) {
          return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Remove from company
        await supabaseAdmin
          .from("company_users")
          .delete()
          .eq("user_id", user_id)
          .eq("company_id", company_id);

        // Check if user belongs to other companies
        const { data: otherMemberships } = await supabaseAdmin
          .from("company_users")
          .select("id")
          .eq("user_id", user_id);

        // If no other memberships, delete the user entirely
        if (!otherMemberships || otherMemberships.length === 0) {
          await supabaseAdmin.from("user_modules").delete().eq("user_id", user_id);
          await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
          await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
          await supabaseAdmin.auth.admin.deleteUser(user_id);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list": {
        // Get all users in company
        const { data: members } = await supabaseAdmin
          .from("company_users")
          .select("user_id, role, created_at")
          .eq("company_id", company_id);

        if (!members || members.length === 0) {
          return new Response(
            JSON.stringify({ users: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const userIds = members.map(m => m.user_id);
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("user_id, email, display_name, must_change_password")
          .in("user_id", userIds);

        const users = members.map(m => {
          const profile = profiles?.find(p => p.user_id === m.user_id);
          return {
            user_id: m.user_id,
            role: m.role,
            email: profile?.email || "",
            display_name: profile?.display_name || "",
            must_change_password: profile?.must_change_password || false,
            created_at: m.created_at,
          };
        });

        return new Response(
          JSON.stringify({ users }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
