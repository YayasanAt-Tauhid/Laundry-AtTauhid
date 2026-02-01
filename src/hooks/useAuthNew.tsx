import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, authApi, usersApi } from '@/lib/api';
import type { UserRole } from '@/lib/constants';

interface User {
    id: string;
    email: string;
    name: string;
}

interface Session {
    id: string;
    userId: string;
    expiresAt: Date;
}

interface Profile {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    userRole: UserRole | null;
    profile: Profile | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string, fullName: string, phone: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUserData = useCallback(async () => {
        try {
            const { data, error } = await usersApi.getMe();

            if (error || !data) {
                setUser(null);
                setSession(null);
                setUserRole(null);
                setProfile(null);
                return;
            }

            setUser({
                id: data.id,
                email: data.email,
                name: data.name,
            });

            setUserRole(data.primaryRole as UserRole);

            if (data.profile) {
                setProfile({
                    id: data.profile.id,
                    fullName: data.profile.fullName,
                    email: data.profile.email,
                    phone: data.profile.phone,
                });
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            setUser(null);
            setSession(null);
            setUserRole(null);
            setProfile(null);
        }
    }, []);

    const checkSession = useCallback(async () => {
        try {
            setLoading(true);

            const { data, error } = await authApi.getSession();

            if (error || !data || !data.user) {
                setUser(null);
                setSession(null);
                setUserRole(null);
                setProfile(null);
                return;
            }

            setUser({
                id: data.user.id,
                email: data.user.email,
                name: data.user.name,
            });

            if (data.session) {
                setSession({
                    id: data.session.id,
                    userId: data.session.userId,
                    expiresAt: new Date(data.session.expiresAt),
                });
            }

            // Fetch additional user data (roles, profile)
            await fetchUserData();
        } catch (error) {
            console.error('Error checking session:', error);
            setUser(null);
            setSession(null);
            setUserRole(null);
            setProfile(null);
        } finally {
            setLoading(false);
        }
    }, [fetchUserData]);

    useEffect(() => {
        checkSession();
    }, [checkSession]);

    const signIn = async (email: string, password: string) => {
        try {
            const { data, error } = await authApi.signIn(email, password);

            if (error) {
                return { error: new Error(error.error || 'Failed to sign in') };
            }

            if (data?.user) {
                setUser({
                    id: data.user.id,
                    email: data.user.email,
                    name: data.user.name,
                });

                if (data.session) {
                    setSession({
                        id: data.session.id,
                        userId: data.session.userId,
                        expiresAt: new Date(data.session.expiresAt),
                    });
                }

                // Fetch additional user data
                await fetchUserData();
            }

            return { error: null };
        } catch (error) {
            console.error('Sign in error:', error);
            return { error: error as Error };
        }
    };

    const signUp = async (email: string, password: string, fullName: string, phone: string) => {
        try {
            const { data, error } = await authApi.signUp(email, password, fullName, phone);

            if (error) {
                return { error: new Error(error.error || 'Failed to sign up') };
            }

            if (data?.user) {
                setUser({
                    id: data.user.id,
                    email: data.user.email,
                    name: data.user.name,
                });

                if (data.session) {
                    setSession({
                        id: data.session.id,
                        userId: data.session.userId,
                        expiresAt: new Date(data.session.expiresAt),
                    });
                }

                // Fetch additional user data
                await fetchUserData();
            }

            return { error: null };
        } catch (error) {
            console.error('Sign up error:', error);
            return { error: error as Error };
        }
    };

    const signOut = async () => {
        try {
            await authApi.signOut();
        } catch (error) {
            console.error('Sign out error:', error);
        } finally {
            setUser(null);
            setSession(null);
            setUserRole(null);
            setProfile(null);
        }
    };

    const refreshUser = async () => {
        await checkSession();
    };

    return (
        <AuthContext.Provider value={{
            user,
            session,
            userRole,
            profile,
            loading,
            signIn,
            signUp,
            signOut,
            refreshUser,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
