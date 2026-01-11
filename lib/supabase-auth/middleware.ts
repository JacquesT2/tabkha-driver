import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Start with a check: do we have the env vars?
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
        // Fail confidential - if we can't check auth, don't let them in to protected areas
        const isProtected =
            request.nextUrl.pathname === '/' ||
            request.nextUrl.pathname.startsWith('/management') ||
            request.nextUrl.pathname.startsWith('/driver');

        if (isProtected) {
            return new NextResponse('Configuration Error: Auth Keys Missing', { status: 500 });
        }
        return response;
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Whitelist Logic
    const allowedEmailsRaw = process.env.ALLOWED_DRIVER_EMAILS;
    if (user && allowedEmailsRaw) {
        const allowedEmails = allowedEmailsRaw.split(',').map(e => e.trim().toLowerCase());
        const userEmail = user.email?.toLowerCase();

        if (userEmail && !allowedEmails.includes(userEmail)) {
            // User not in whitelist
            if (!request.nextUrl.pathname.startsWith('/unauthorized')) {
                await supabase.auth.signOut();
                return NextResponse.redirect(new URL('/unauthorized', request.url));
            }
        }
    }

    // Protected Route Logic
    const isProtectedRoute =
        request.nextUrl.pathname === '/' ||
        request.nextUrl.pathname.startsWith('/management') ||
        request.nextUrl.pathname.startsWith('/driver');

    console.log(`[Middleware] Path: ${request.nextUrl.pathname}, User: ${!!user}, Protected: ${isProtectedRoute}`);

    if (isProtectedRoute && !user) {
        console.log('[Middleware] Redirecting to login');
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Redirect to home if logged in and visiting login
    if (user && request.nextUrl.pathname.startsWith('/login')) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return response
}
