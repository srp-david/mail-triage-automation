import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { registrationSchema } from '../forms/schemas';
import { Form } from '../forms/Form';
import { Field } from '../components/Controls';
import { errorText } from '../api/client';

export function SetupStep({
  number,
  title,
  description,
  status,
  complete = false,
  children,
}: {
  number: number;
  title: string;
  description: string;
  status: string;
  complete?: boolean;
  children: ReactNode;
}) {
  return (
    <Box component="section" className="setup-step" aria-labelledby={`setup-step-${number}`}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'flex-start' }}
        className="setup-step-heading"
      >
        <Box className="setup-number" aria-hidden="true">
          {number.toString().padStart(2, '0')}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h3" variant="h3" id={`setup-step-${number}`}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
        <Chip label={status} color={complete ? 'success' : 'default'} variant="outlined" />
      </Stack>
      <Box className="setup-step-body">{children}</Box>
    </Box>
  );
}

export function Registration({
  label,
  button,
  placeholder,
  disabled,
  onRegister,
}: {
  label: string;
  button: string;
  placeholder: string;
  disabled?: boolean;
  onRegister: (name: string) => Promise<void>;
}) {
  const form = useForm<z.infer<typeof registrationSchema>>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { name: '' },
  });
  const [error, setError] = useState('');
  return (
    <Form
      className="setup-registration"
      aria-label={`${label} 등록`}
      onSubmit={form.handleSubmit(async ({ name }) => {
        setError('');
        try {
          await onRegister(name);
          form.reset();
        } catch (e) {
          setError(errorText(e));
        }
      })}
    >
      <Field
        aria-label={label}
        placeholder={placeholder}
        {...form.register('name')}
        maxLength={200}
        disabled={disabled || form.formState.isSubmitting}
        errorMessage={form.formState.errors.name?.message}
      />
      <Button type="submit" disabled={disabled || form.formState.isSubmitting}>
        {button}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Form>
  );
}
